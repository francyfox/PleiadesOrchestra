import { describe, expect, test } from "bun:test";
import { createApp } from "../../app.ts";
import { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import { testDb } from "../database/database.testing.ts";
import {
	admin,
	agent,
	decisionAgent,
	json,
	NOW,
} from "../http/http.testing.ts";
import { RunBinding } from "../run-binding/run-binding.ts";
import {
	createAgentSettings,
	decryptSecret,
	encryptSecret,
} from "./agent-settings.service.ts";

const SECRET = "test-secret-of-sixteen+";
const DEFAULTS = {
	"beta-text": {
		baseUrl: "http://beta-text:8080/v1",
		apiKey: "env-key",
		model: "vikhr",
		temperature: 0.3,
	},
	"delta-function-call": {
		baseUrl: "http://delta:8282/v1",
		apiKey: "",
		model: "qwen3-1.7b",
		temperature: 0,
	},
	"gamma-decision": {
		baseUrl: "http://laya:8090",
		apiKey: "",
		model: "laya",
	},
};

async function setup(fetchImpl?: typeof fetch) {
	const db = testDb();
	const agentSettings = createAgentSettings({
		db,
		secret: SECRET,
		defaults: DEFAULTS,
		now: () => NOW,
		fetch: fetchImpl,
	});
	const app = createApp({
		agent,
		decisionAgent,
		apiKey: "transport-key",
		adminApiKey: "admin-key",
		maxChunkChars: 100,
		db,
		channels: new ChannelDirectory(db),
		runs: new RunBinding(),
		ipHashSalt: "salt",
		now: () => NOW,
		agentSettings,
	});
	await agentSettings.refresh();
	return { app, agentSettings };
}

describe("agent settings", () => {
	test("without an override the env values are in effect", async () => {
		const { agentSettings } = await setup();
		expect(agentSettings.effective("beta-text")).toMatchObject({
			baseUrl: "http://beta-text:8080/v1",
			apiKey: "env-key",
			model: "vikhr",
			temperature: 0.3,
		});
	});

	test("a saved override wins, a cleared field falls back to env, and onChange fires", async () => {
		const { app, agentSettings } = await setup();
		let changes = 0;
		agentSettings.onChange(() => changes++);
		const patch = (body: unknown) =>
			app.handle(admin("/agents/beta-text", { method: "PATCH", body }));
		await json(
			await patch({
				source: "external",
				baseUrl: "https://openrouter.ai/api/v1",
				model: "google/gemini-2.5-flash",
				parameters: { temperature: 0.7, extraBody: { provider: { x: 1 } } },
			}),
		);
		expect(agentSettings.effective("beta-text")).toMatchObject({
			baseUrl: "https://openrouter.ai/api/v1",
			model: "google/gemini-2.5-flash",
			temperature: 0.7,
			extraBody: { provider: { x: 1 } },
			// env key must not travel to another host
			apiKey: "",
		});
		await json(await patch({ model: null, parameters: null }));
		expect(agentSettings.effective("beta-text")).toMatchObject({
			model: "vikhr",
			temperature: 0.3,
			baseUrl: "https://openrouter.ai/api/v1",
		});
		expect(changes).toBe(2);
	});

	test("a picked provider key is used, and no response ever carries it in clear", async () => {
		const { app, agentSettings } = await setup();
		await json(
			await app.handle(
				admin("/provider-keys/openrouter", {
					method: "PUT",
					body: { key: "sk-or-v1-supersecret1234" },
				}),
			),
		);
		const patched = await json(
			await app.handle(
				admin("/agents/delta-function-call", {
					method: "PATCH",
					body: {
						source: "external",
						baseUrl: "https://openrouter.ai/api/v1",
						providerKey: "openrouter",
					},
				}),
			),
		);
		const seen = [
			JSON.stringify(patched),
			JSON.stringify(
				await json(await app.handle(admin("/agents/delta-function-call"))),
			),
			JSON.stringify(await json(await app.handle(admin("/provider-keys")))),
		];
		for (const body of seen) expect(body).not.toContain("supersecret");
		expect(seen[2]).toContain("1234");
		expect(agentSettings.effective("delta-function-call")).toMatchObject({
			apiKey: "sk-or-v1-supersecret1234",
			provider: "openrouter",
		});
	});

	test("encryption round-trips and the ciphertext hides the key", async () => {
		const sealed = await encryptSecret(SECRET, "sk-abc");
		expect(sealed).not.toContain("sk-abc");
		expect(await decryptSecret(SECRET, sealed)).toBe("sk-abc");
		expect(sealed).not.toBe(await encryptSecret(SECRET, "sk-abc"));
	});

	test("gamma-decision cannot be switched to an external server", async () => {
		const { app } = await setup();
		const response = await app.handle(
			admin("/agents/gamma-decision", {
				method: "PATCH",
				body: { baseUrl: "https://example.com/v1" },
			}),
		);
		expect(response.status).toBe(400);
	});

	test("test endpoint calls the effective server and reports answer and latency", async () => {
		let seen: { url: string; auth: string | null; body: string } | undefined;
		const { app } = await setup((async (url: string, init: RequestInit) => {
			seen = {
				url,
				auth: new Headers(init.headers).get("authorization"),
				body: String(init.body),
			};
			return Response.json({ choices: [{ message: { content: "OK" } }] });
		}) as unknown as typeof fetch);
		const result = await json(
			await app.handle(
				admin("/agents/beta-text/test", { method: "POST", body: {} }),
			),
		);
		expect(result).toMatchObject({ ok: true, answer: "OK" });
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(seen?.url).toBe("http://beta-text:8080/v1/chat/completions");
		expect(seen?.auth).toBe("Bearer env-key");
		expect(JSON.parse(seen?.body ?? "{}")).toMatchObject({
			model: "vikhr",
			temperature: 0.3,
		});
	});

	test("needs the admin key", async () => {
		const { app } = await setup();
		expect(
			(await app.handle(admin("/agents/beta-text", { key: "transport-key" })))
				.status,
		).toBe(401);
	});
});
