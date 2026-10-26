import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { createProvidersConfig } from "../providers/providers.service.ts";
import { RunBinding } from "../run-binding/run-binding.ts";
import {
	AgentSettingsError,
	createAgentSettings,
} from "./agent-settings.service.ts";

const ENV = {
	"beta-text": {
		baseUrl: "http://beta-text:8080/v1",
		apiKey: "env-key",
		model: "vikhr",
	},
	"delta-function-call": {
		baseUrl: "http://delta:8282/v1",
		apiKey: "",
		model: "qwen3-1.7b",
	},
	"gamma-decision": {
		baseUrl: "http://laya:8090",
		apiKey: "",
		model: "laya",
	},
};

// The env server of beta-text is in the file (as seeded), with its temperature.
const SEED = `
[providers.local-text]
base_url = "http://beta-text:8080/v1"
api_key = "$LLM_API_KEY"
models = [{ id = "vikhr", temperature = 0.3 }]
`;

// Decision providers speak systemone: the local Laya and TypeSafe's hosted Jev.
const SYSTEMONE = `
[providers.laya]
base_url = "http://laya:8090"
type = "systemone"
models = [{ id = "laya" }]

[providers.typesafe]
base_url = "https://api.typesafe.ai"
type = "systemone"
api_key = "$TYPESAFE_AI_API_KEY"
models = [{ id = "jev-latest" }]
`;

let dir = "";
afterEach(async () => {
	if (dir) await rm(dir, { recursive: true });
	dir = "";
});

async function setup(fetchImpl?: typeof fetch, seed = SEED) {
	dir = await mkdtemp(join(tmpdir(), "agent-settings-"));
	const path = join(dir, "providers.toml");
	await Bun.write(path, seed);
	const db = testDb();
	const agentSettings = createAgentSettings({
		db,
		env: ENV,
		providers: await createProvidersConfig({
			path,
			seed: () => [],
			env: { LLM_API_KEY: "env-key", TYPESAFE_AI_API_KEY: "jev-key" },
		}),
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
	const call = (path: string, method = "GET", body?: unknown) =>
		app.handle(admin(path, { method, body }));
	return { app, agentSettings, call, path };
}

describe("agent settings", () => {
	test("without a pick an agent uses its env server, with the file's parameters when the file has that server", async () => {
		const { agentSettings } = await setup();
		expect(agentSettings.effective("beta-text")).toEqual({
			provider: "local-text",
			baseUrl: "http://beta-text:8080/v1",
			apiKey: "env-key",
			model: "vikhr",
			temperature: 0.3,
			reasoningEffort: undefined,
			extraBody: {},
		});
		expect(agentSettings.effective("delta-function-call")).toEqual({
			...ENV["delta-function-call"],
			extraBody: {},
		});
	});

	test("a picked model brings its provider, key and parameters; the agent is rebuilt; deleting the model falls back to env", async () => {
		const { agentSettings, call } = await setup();
		const builds: string[] = [];
		agentSettings.track(() =>
			builds.push(agentSettings.effective("delta-function-call").model),
		);
		await call("/providers/openrouter", "PUT", {
			name: "OpenRouter",
			baseUrl: "https://openrouter.ai/api/v1",
			apiKey: "sk-or-v1-supersecret1234",
		});
		await call("/providers/openrouter/models", "PUT", {
			id: "qwen/qwen3-30b",
			name: "Qwen3 30B",
			types: ["language"],
			temperature: 0,
			reasoningEffort: "none",
			extraBody: { provider: { require_parameters: true } },
		});
		const picked = await json(
			await call("/agents/delta-function-call/model", "PUT", {
				provider: "openrouter",
				model: "qwen/qwen3-30b",
			}),
		);
		expect(picked).toMatchObject({
			provider: "openrouter",
			model: "qwen/qwen3-30b",
			baseUrl: "https://openrouter.ai/api/v1",
			updatedBy: expect.any(String),
		});
		expect(agentSettings.effective("delta-function-call")).toEqual({
			provider: "openrouter",
			baseUrl: "https://openrouter.ai/api/v1",
			apiKey: "sk-or-v1-supersecret1234",
			model: "qwen/qwen3-30b",
			temperature: 0,
			reasoningEffort: "none",
			extraBody: { provider: { require_parameters: true } },
		});
		expect(builds.at(-1)).toBe("qwen/qwen3-30b");

		await call("/providers/openrouter/models?model=qwen%2Fqwen3-30b", "DELETE");
		expect(agentSettings.effective("delta-function-call").baseUrl).toBe(
			"http://delta:8282/v1",
		);
	});

	test("a model saved with ?fromProvider&fromId replaces that one: renamed or moved, the agents that picked it follow", async () => {
		const { agentSettings, call } = await setup();
		await call("/providers/openrouter", "PUT", {
			name: "OpenRouter",
			baseUrl: "https://openrouter.ai/api/v1",
			apiKey: "sk-or",
		});
		const model = { name: "Gemini", types: ["language"], extraBody: {} };
		await call("/providers/openrouter/models", "PUT", {
			...model,
			id: "google/gemini-2.5-flash-lite",
		});
		await call("/agents/beta-text/model", "PUT", {
			provider: "openrouter",
			model: "google/gemini-2.5-flash-lite",
		});

		const renamed = await json(
			await call(
				"/providers/openrouter/models?fromProvider=openrouter&fromId=google%2Fgemini-2.5-flash-lite",
				"PUT",
				{ ...model, id: "google/gemini-3.5-flash-lite" },
			),
		);
		const ids = (
			renamed as { items: { id: string; models: { id: string }[] }[] }
		).items
			.find((p) => p.id === "openrouter")
			?.models.map((m) => m.id);
		expect(ids).toEqual(["google/gemini-3.5-flash-lite"]);
		expect(agentSettings.effective("beta-text")).toMatchObject({
			provider: "openrouter",
			model: "google/gemini-3.5-flash-lite",
		});

		// Moved to another provider (the old edit dropped the agent to its env server).
		await call("/providers/other", "PUT", {
			name: "Other",
			baseUrl: "https://other.example/v1",
		});
		await call(
			"/providers/other/models?fromProvider=openrouter&fromId=google%2Fgemini-3.5-flash-lite",
			"PUT",
			{ ...model, id: "google/gemini-3.5-flash-lite" },
		);
		expect(agentSettings.effective("beta-text")).toMatchObject({
			provider: "other",
			baseUrl: "https://other.example/v1",
		});
	});

	test("bad picks are refused", async () => {
		const { call } = await setup();
		const pick = (id: string, body: unknown) =>
			call(`/agents/${id}/model`, "PUT", body);
		expect(
			(await pick("beta-text", { provider: "nope", model: "x" })).status,
		).toBe(400);
		expect(
			(await pick("gamma-decision", { provider: "local-text", model: "vikhr" }))
				.status,
		).toBe(400);
		expect((await pick("nope", { provider: "a", model: "b" })).status).toBe(
			404,
		);
	});

	test("gamma picks decision models only, the others language models only", async () => {
		const { agentSettings, call } = await setup(undefined, SEED + SYSTEMONE);
		await call("/agents/gamma-decision/model", "PUT", {
			provider: "typesafe",
			model: "jev-latest",
		});
		expect(agentSettings.effective("gamma-decision")).toMatchObject({
			provider: "typesafe",
			baseUrl: "https://api.typesafe.ai",
			apiKey: "jev-key",
			model: "jev-latest",
		});
		expect(() =>
			agentSettings.pick(
				"gamma-decision",
				{ provider: "local-text", model: "vikhr" },
				"a",
			),
		).toThrow(AgentSettingsError);
		expect(() =>
			agentSettings.pick(
				"beta-text",
				{ provider: "typesafe", model: "jev-latest" },
				"a",
			),
		).toThrow(AgentSettingsError);
		const list = await json(await call("/providers"));
		expect(
			list.items.map((p: { models: { types: string[] }[] }) =>
				p.models.map((m) => m.types),
			),
		).toEqual([[["language"]], [["decision"]], [["decision"]]]);
	});

	test("one provider with a language and a decision model: each agent takes its own, decisions go to decisions_url", async () => {
		const { agentSettings } = await setup(
			undefined,
			`${SEED}
[providers.openrouter]
base_url = "https://openrouter.ai/api/v1"
decisions_url = "https://openrouter.ai/api/alpha/decisions"
api_key = "sk-or-v1-key"
models = [{ id = "qwen/qwen3-30b", types = ["language", "image"] }, { id = "liquid/d1-ultra", types = ["decision"] }]
`,
		);
		agentSettings.pick(
			"gamma-decision",
			{ provider: "openrouter", model: "liquid/d1-ultra" },
			"a",
		);
		agentSettings.pick(
			"beta-text",
			{ provider: "openrouter", model: "qwen/qwen3-30b" },
			"a",
		);
		expect(agentSettings.effective("gamma-decision")).toMatchObject({
			baseUrl: "https://openrouter.ai/api/alpha/decisions",
			apiKey: "sk-or-v1-key",
		});
		expect(agentSettings.effective("beta-text").baseUrl).toBe(
			"https://openrouter.ai/api/v1",
		);
		expect(() =>
			agentSettings.pick(
				"gamma-decision",
				{ provider: "openrouter", model: "qwen/qwen3-30b" },
				"a",
			),
		).toThrow(AgentSettingsError);
	});

	test("no agent picks a translation model", async () => {
		const { agentSettings } = await setup(
			undefined,
			`${SEED}${SYSTEMONE}
[providers.local-translate]
type = "ctranslate2"
models = [{ id = "org/opus" }]
`,
		);
		for (const id of ["beta-text", "gamma-decision"] as const)
			expect(() =>
				agentSettings.pick(
					id,
					{ provider: "local-translate", model: "org/opus" },
					"a",
				),
			).toThrow(AgentSettingsError);
	});

	test("test for gamma makes one systemone decision at the effective server", async () => {
		let seen: { url: string; auth: string | null } | undefined;
		const { call } = await setup(
			(async (url: string, init: RequestInit) => {
				seen = {
					url,
					auth: new Headers(init.headers).get("authorization"),
				};
				return Response.json({
					model: "jev-latest",
					answers: { ok: { type: "noul", noul: 0.9 } },
					usage: { input_tokens: 38, output_tokens: 0 },
				});
			}) as unknown as typeof fetch,
			SEED + SYSTEMONE,
		);
		await call("/agents/gamma-decision/model", "PUT", {
			provider: "typesafe",
			model: "jev-latest",
		});
		const result = await json(
			await call("/agents/gamma-decision/test", "POST", {}),
		);
		expect(result).toMatchObject({
			ok: true,
			input: 'Fact: "Water is wet." · Question: "Is the fact true?"',
			answer: "true",
			probability: 0.9,
			inputTokens: 38,
			outputTokens: 0,
		});
		expect(seen?.url).toBe("https://api.typesafe.ai/v1/systemone");
		expect(seen?.auth).toBe("Bearer jev-key");
	});

	test("no response carries a key; the file editor masks it and a masked key saved back keeps it", async () => {
		const { call, path } = await setup();
		await call("/providers/openrouter", "PUT", {
			name: "OpenRouter",
			baseUrl: "https://openrouter.ai/api/v1",
			apiKey: "sk-or-v1-supersecret1234",
		});
		const list = await json(await call("/providers"));
		const text = await json(await call("/providers-toml"));
		for (const body of [list, text])
			expect(JSON.stringify(body)).not.toContain("supersecret");
		expect(list.items[1]).toMatchObject({
			id: "openrouter",
			apiKey: "••••1234",
		});
		expect(list.items[0].apiKey).toBe("$LLM_API_KEY");

		const saved = await call("/providers-toml", "PUT", {
			toml: text.toml.replace('name = "OpenRouter"', 'name = "OR"'),
		});
		expect(saved.status).toBe(200);
		const file = await Bun.file(path).text();
		expect(file).toContain("sk-or-v1-supersecret1234");
		expect(file).toContain('name = "OR"');
		expect(
			(await call("/providers-toml", "PUT", { toml: "[providers.x" })).status,
		).toBe(400);
	});

	test("providers-toml/check reports every problem, never writes and never returns a key", async () => {
		const { call, path } = await setup();
		await call("/providers/openrouter", "PUT", {
			name: "OpenRouter",
			baseUrl: "https://openrouter.ai/api/v1",
			apiKey: "sk-or-v1-supersecret1234",
		});
		const before = await Bun.file(path).text();
		const check = async (toml: string) =>
			json(await call("/providers-toml/check", "POST", { toml }));
		expect(await check("")).toEqual({ errors: [] });
		expect(
			await check((await json(await call("/providers-toml"))).toml),
		).toEqual({
			errors: [],
		});
		expect(await check("\n\n[providers.x")).toEqual({
			errors: [expect.objectContaining({ line: 3 })],
		});
		const bad = await check(
			'[providers.x]\nbase_url = "ftp://x"\napi_key = "••••9999"\n[providers.openrouter]\nbase_url = "http://o/v1"\napi_key = "••••9999"\n',
		);
		expect(bad.errors.map((e: { path: string }) => e.path)).toEqual([
			"providers.x.base_url",
		]);
		const forged = await check(
			'[providers.openrouter]\nbase_url = "http://o/v1"\napi_key = "••••9999"\n',
		);
		expect(forged.errors[0].path).toBe("providers.openrouter.api_key");
		expect(JSON.stringify([bad, forged])).not.toContain("supersecret");
		expect(await Bun.file(path).text()).toBe(before);
	});

	test("test endpoint calls the effective server and reports answer and latency", async () => {
		let seen: { url: string; auth: string | null; body: string } | undefined;
		const { call } = await setup((async (url: string, init: RequestInit) => {
			seen = {
				url,
				auth: new Headers(init.headers).get("authorization"),
				body: String(init.body),
			};
			return Response.json({ choices: [{ message: { content: "OK" } }] });
		}) as unknown as typeof fetch);
		const result = await json(await call("/agents/beta-text/test", "POST", {}));
		expect(result).toMatchObject({ ok: true, answer: "OK" });
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
