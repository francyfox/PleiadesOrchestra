import { describe, expect, test } from "bun:test";
import type { Agent, DecisionAgent } from "@repo/core";
import { createApp } from "../../app.ts";
import { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import { llmCalls } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import type { Db } from "../database/database.ts";
import { RunBinding } from "../run-binding/run-binding.ts";

const ADMIN_KEY = "admin-key";
const NOW = Date.UTC(2026, 8, 24, 12);
const DAY = 24 * 60 * 60 * 1000;

const agent: Agent = {
	async *handleMessageStream() {},
	async resetThread() {},
};
const decisionAgent: DecisionAgent = { decide: async () => ({}) };

function setup() {
	const db = testDb();
	const app = createApp({
		agent,
		decisionAgent,
		apiKey: "transport-key",
		adminApiKey: ADMIN_KEY,
		maxChunkChars: 100,
		db,
		channels: new ChannelDirectory(db),
		runs: new RunBinding(),
		ipHashSalt: "salt",
		now: () => NOW,
	});
	return { db, app };
}

function admin(
	path: string,
	init: {
		method?: string;
		body?: unknown;
		adminId?: string | null;
		key?: string;
	} = {},
): Request {
	const headers: Record<string, string> = {
		authorization: `Bearer ${init.key ?? ADMIN_KEY}`,
	};
	if (init.adminId !== null) headers["x-admin-id"] = init.adminId ?? "admin-1";
	if (init.body !== undefined) headers["content-type"] = "application/json";
	return new Request(`http://harness.local/v1/admin${path}`, {
		method: init.method ?? "GET",
		headers,
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});
}

// biome-ignore lint/suspicious/noExplicitAny: loosely-typed JSON bodies keep the assertions readable
async function json<T = any>(response: Response): Promise<T> {
	expect(response.status).toBeLessThan(300);
	return (await response.json()) as T;
}

function call(
	db: Db,
	at: number,
	kind: "generate" | "ingest" | "decision",
	latencyMs: number,
	outputTokens: number | null = null,
	ok = true,
) {
	db.insert(llmCalls)
		.values({
			at,
			userId: null,
			channelId: "ch_telegram",
			kind,
			provider: kind === "decision" ? "laya" : "albedo",
			model: kind === "decision" ? "laya-system-one" : "vikhr",
			inputTokens: kind === "decision" ? null : 10,
			outputTokens,
			latencyMs,
			ok,
		})
		.run();
}

describe("GET /v1/admin/performance", () => {
	test("latency percentiles per day and call kind, plus the period overall", async () => {
		const { db, app } = setup();
		// Day 1: ten decisions, 100..1000 ms.
		for (let i = 1; i <= 10; i++) call(db, NOW - DAY, "decision", i * 100);
		// Day 2: two generations — 50 tokens in 1 s and 100 tokens in 4 s.
		call(db, NOW, "generate", 1000, 50);
		call(db, NOW, "generate", 4000, 100);
		// A failed call counts as a call and as failed, and its latency is included.
		call(db, NOW, "generate", 9000, null, false);

		const body = await json(
			await app.handle(admin(`/performance?from=${NOW - 2 * DAY}&to=${NOW}`)),
		);

		expect(body.rows).toEqual([
			{
				day: "2026-09-23",
				kind: "decision",
				calls: 10,
				failed: 0,
				p50: 500,
				p90: 900,
				p99: 1000,
				max: 1000,
				tokensPerSecond: null,
			},
			{
				day: "2026-09-24",
				kind: "generate",
				calls: 3,
				failed: 1,
				p50: 4000,
				p90: 9000,
				p99: 9000,
				max: 9000,
				// Median over successful calls that reported output tokens: 50/s and 25/s.
				tokensPerSecond: 37.5,
			},
		]);
		expect(body.overall).toEqual([
			{
				kind: "decision",
				calls: 10,
				failed: 0,
				p50: 500,
				p90: 900,
				p99: 1000,
				max: 1000,
				tokensPerSecond: null,
			},
			{
				kind: "generate",
				calls: 3,
				failed: 1,
				p50: 4000,
				p90: 9000,
				p99: 9000,
				max: 9000,
				tokensPerSecond: 37.5,
			},
		]);
	});

	test("an empty period returns no rows", async () => {
		const { app } = setup();
		const body = await json(await app.handle(admin("/performance")));
		expect(body).toEqual({ rows: [], overall: [] });
	});
});
