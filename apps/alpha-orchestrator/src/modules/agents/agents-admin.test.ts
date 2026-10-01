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
				checkedAt: expect.any(Number),
			},
		]);
		expect(JSON.stringify(body)).not.toContain("secret");
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
