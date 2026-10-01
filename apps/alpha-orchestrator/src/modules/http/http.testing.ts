import { expect } from "bun:test";
import type { Agent, DecisionAgent } from "@repo/core";
import { createApp } from "../../app.ts";
import { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import { llmCalls } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import type { Db } from "../database/database.ts";
import { RunBinding } from "../run-binding/run-binding.ts";

export const ADMIN_KEY = "admin-key";
export const NOW = Date.UTC(2026, 8, 24, 12);
export const DAY = 24 * 60 * 60 * 1000;

export const agent: Agent = {
	async *handleMessageStream() {},
	async resetThread() {},
};
export const decisionAgent: DecisionAgent = { decide: async () => ({}) };

export function setupAdminApp() {
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

export function admin(
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
export async function json<T = any>(response: Response): Promise<T> {
	expect(response.status).toBeLessThan(300);
	return (await response.json()) as T;
}

export function seedLlmCall(
	db: Db,
	userId: string | null,
	at: number,
	input: number | null,
	output: number | null,
) {
	db.insert(llmCalls)
		.values({
			at,
			userId,
			channelId: "ch_telegram",
			kind: "generate",
			provider: "albedo",
			model: "vikhr",
			inputTokens: input,
			outputTokens: output,
			latencyMs: 10,
			ok: true,
		})
		.run();
}
