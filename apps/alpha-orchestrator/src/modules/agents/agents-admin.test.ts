import { describe, expect, test } from "bun:test";
import { createApp } from "../../app.ts";
import { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import { testDb } from "../database/database.testing.ts";
import {
	ADMIN_KEY,
	admin,
	agent,
	decisionAgent,
	json,
	NOW,
	setupAdminApp,
} from "../http/http.testing.ts";
import { RunBinding } from "../run-binding/run-binding.ts";

describe("admin agents", () => {
	test("GET /agents lists the configured agents with their health, credentials stripped", async () => {
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
			agents: {
				specs: [
					{
						id: "beta-text",
						name: "beta-text",
						role: "text",
						baseUrl: "http://key:secret@beta-text:8080/v1?token=x",
						model: "vikhr",
					},
				],
				fetch: async () => new Response("ok"),
			},
		});
		const body = await json(await app.handle(admin("/agents")));
		expect(body.items).toEqual([
			{
				id: "beta-text",
				name: "beta-text",
				role: "text",
				endpoint: "http://beta-text:8080/v1",
				model: "vikhr",
				status: "up",
				latencyMs: expect.any(Number),
				responseMs: null,
				checkedAt: expect.any(Number),
			},
		]);
		expect(JSON.stringify(body)).not.toContain("secret");
	});

	test("responseMs is the mean latency of the model's real calls in the last 24 h, null when there are none", async () => {
		const db = testDb();
		const DAY = 24 * 60 * 60 * 1000;
		const call = (model: string, latencyMs: number, at: number, ok = true) =>
			db.$client.run(
				"INSERT INTO llm_calls (at, kind, provider, model, latency_ms, ok) VALUES (?, 'generate', 'p', ?, ?, ?)",
				[at, model, latencyMs, ok ? 1 : 0],
			);
		call("vikhr", 1000, NOW - 1000);
		call("vikhr", 2000, NOW - 2000);
		call("vikhr", 90_000, NOW - 1000, false); // a failed call says nothing about response time
		call("vikhr", 50_000, NOW - 2 * DAY); // older than a day
		call("laya-system-one", 400, NOW - 500);
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
			agents: {
				specs: [
					{
						id: "beta-text",
						name: "beta-text",
						role: "text",
						baseUrl: "http://b/v1",
						model: "vikhr",
					},
					{
						id: "gamma-decision",
						name: "gamma-decision",
						role: "decision",
						baseUrl: "http://g",
						model: "liquid/d1-ultra",
					},
					{
						id: "delta-function-call",
						name: "delta",
						role: "function-call",
						baseUrl: "http://d/v1",
						model: "qwen",
					},
				],
				fetch: async () => new Response("ok"),
			},
		});
		const body = await json(await app.handle(admin("/agents")));
		const byId = Object.fromEntries(
			body.items.map((a: { id: string; responseMs: number | null }) => [
				a.id,
				a.responseMs,
			]),
		);
		// the decision ledger rows carry Laya's own model name, whatever model the agent picked
		expect(byId).toEqual({
			"beta-text": 1500,
			"gamma-decision": 400,
			"delta-function-call": null,
		});
	});

	test("answers with the last probe while the next one runs; new specs wait for their own", async () => {
		let up = true;
		let hang = false;
		let baseUrl = "http://a:8080/v1";
		const app = createApp({
			agent,
			decisionAgent,
			apiKey: "transport-key",
			adminApiKey: ADMIN_KEY,
			maxChunkChars: 100,
			db: testDb(),
			channels: new ChannelDirectory(testDb()),
			runs: new RunBinding(),
			ipHashSalt: "salt",
			now: () => NOW,
			agents: {
				specs: () => [
					{ id: "x", name: "x", role: "decision", baseUrl, model: null },
				],
				fetch: () =>
					hang
						? new Promise<Response>(() => {})
						: Promise.resolve(new Response("", { status: up ? 200 : 503 })),
			},
		});
		const list = async () =>
			(await json(await app.handle(admin("/agents")))).items;

		expect((await list())[0].status).toBe("up");
		up = false;
		expect((await list())[0].status).toBe("up"); // previous probe; this call refreshes
		expect((await list())[0].status).toBe("down");
		hang = true;
		expect((await list())[0].status).toBe("down"); // doesn't wait for a hanging probe
		hang = false;
		baseUrl = "http://b:8080/v1";
		expect((await list())[0].endpoint).toBe("http://b:8080/v1");
	});

	test("without configured agents the list is empty", async () => {
		const { app } = setupAdminApp();
		const body = await json(await app.handle(admin("/agents")));
		expect(body).toEqual({ items: [] });
	});

	test("needs the admin key", async () => {
		const { app } = setupAdminApp();
		expect(
			(await app.handle(admin("/agents", { key: "transport-key" }))).status,
		).toBe(401);
	});
});
