import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelType } from "./providers.service.ts";
import {
	createProvidersConfig,
	maskKey,
	type Provider,
	ProvidersConfigError,
	parseProviders,
	prepareProviders,
	providersSchemaText,
	removeModel,
	seedProviders,
	stringifyProviders,
	upsertModel,
	upsertProvider,
} from "./providers.service.ts";

const TOML = `
[providers.openrouter]
name = "OpenRouter"
base_url = "https://openrouter.ai/api/v1"
api_key = "sk-or-v1-secret1234"

[[providers.openrouter.models]]
id = "qwen/qwen3-30b-a3b-instruct-2507"
temperature = 0
reasoning_effort = "none"
extra_body = { provider = { require_parameters = true } }

[providers.ollama]
base_url = "http://192.168.100.39:11434/v1"
api_key = "$OLLAMA_KEY"
models = [{ id = "qwen3:1.7b", name = "Qwen3 1.7B", context_window = 32000 }]
`;

const OPENROUTER: Provider = {
	id: "openrouter",
	name: "OpenRouter",
	baseUrl: "https://openrouter.ai/api/v1",
	apiKey: "sk-or-v1-secret1234",
	models: [
		{
			id: "qwen/qwen3-30b-a3b-instruct-2507",
			name: "qwen/qwen3-30b-a3b-instruct-2507",
			types: ["language"],
			temperature: 0,
			reasoningEffort: "none",
			extraBody: { provider: { require_parameters: true } },
		},
	],
};

async function inTempDir(run: (dir: string) => Promise<void>) {
	const dir = await mkdtemp(join(tmpdir(), "providers-"));
	try {
		await run(dir);
	} finally {
		await rm(dir, { recursive: true });
	}
}

describe("providers.toml", () => {
	test("parses Crush-like TOML; name defaults to the id, unknown fields are dropped", () => {
		expect(parseProviders(TOML)).toEqual([
			OPENROUTER,
			{
				id: "ollama",
				name: "ollama",
				baseUrl: "http://192.168.100.39:11434/v1",
				apiKey: "$OLLAMA_KEY",
				models: [
					{
						id: "qwen3:1.7b",
						name: "Qwen3 1.7B",
						types: ["language"],
						extraBody: {},
					},
				],
			},
		]);
		expect(parseProviders("")).toEqual([]);
	});

	test("refuses broken TOML and bad ids", () => {
		expect(() => parseProviders("[providers.x")).toThrow(ProvidersConfigError);
		expect(() =>
			parseProviders('[providers.X_Y]\nbase_url = "https://x.dev/v1"'),
		).toThrow(ProvidersConfigError);
	});

	test("stringify round-trips, quoting what TOML needs quoted", () => {
		const providers = [
			{
				...OPENROUTER,
				name: 'Open "Router"\n',
				models: [
					{
						...OPENROUTER.models[0],
						extraBody: { "a.b": [1, "x", { c: false }], plain: 2.5 },
					},
				],
			},
		] as Provider[];
		expect(parseProviders(stringifyProviders(providers))).toEqual(providers);
		expect(() =>
			stringifyProviders([
				{
					...OPENROUTER,
					models: [
						{ id: "m", name: "m", types: ["language"], extraBody: { x: null } },
					],
				},
			]),
		).toThrow(ProvidersConfigError);
	});

	test("a decision model round-trips with the provider's decisions_url and keeps it through an upsert", () => {
		const openrouter: Provider = {
			id: "openrouter",
			name: "openrouter",
			baseUrl: "https://openrouter.ai/api/v1",
			decisionsUrl: "https://openrouter.ai/api/alpha/decisions",
			apiKey: "$OPENROUTER_API_KEY",
			models: [
				{
					id: "liquid/d1-ultra",
					name: "liquid/d1-ultra",
					types: ["decision"],
					extraBody: {},
				},
				{
					id: "google/gemini-2.5-flash-lite",
					name: "google/gemini-2.5-flash-lite",
					types: ["language"],
					extraBody: {},
				},
			],
		};
		const text = stringifyProviders([openrouter]);
		expect(text).toContain('types = ["decision"]');
		expect(text).not.toContain('types = ["language"]');
		expect(parseProviders(text)).toEqual([openrouter]);
		expect(
			upsertProvider([openrouter], {
				...openrouter,
				name: "OpenRouter",
				decisionsUrl: undefined,
			})[0]?.decisionsUrl,
		).toBe("https://openrouter.ai/api/alpha/decisions");
	});

	test("every AI SDK model type can be listed, an unknown one is refused", () => {
		for (const type of [
			"language",
			"embedding",
			"image",
			"video",
			"speech",
			"transcription",
			"reranking",
			"decision",
			"translation",
		])
			expect(
				parseProviders(
					`[providers.p]\nbase_url = "https://p.dev/v1"\nmodels = [{ id = "m", type = "${type}" }]`,
				)[0]?.models[0]?.types,
			).toEqual([type as ModelType]);
		expect(() =>
			parseProviders(
				'[providers.p]\nbase_url = "https://p.dev/v1"\nmodels = [{ id = "m", type = "audio" }]',
			),
		).toThrow(ProvidersConfigError);
	});

	test("a multimodal model lists several types, written as types = [...]; the old single type still reads", () => {
		const p = parseProviders(`[providers.p]
base_url = "https://p.dev/v1"
models = [{ id = "vision", types = ["language", "image"] }, { id = "old", type = "decision" }]
`)[0] as Provider;
		expect(p.models.map((m) => m.types)).toEqual([
			["language", "image"],
			["decision"],
		]);
		const text = stringifyProviders([p]);
		expect(text).toContain('types = ["language", "image"]');
		expect(parseProviders(text)).toEqual([p]);
		expect(() =>
			parseProviders(
				'[providers.p]\nbase_url = "https://p.dev/v1"\nmodels = [{ id = "m", types = [] }]',
			),
		).toThrow(ProvidersConfigError);
	});

	test("a file from before model types: the provider's type decides what its models are", () => {
		const [laya, translate, chat] = parseProviders(`[providers.laya]
type = "systemone"
base_url = "http://g:8080"
models = [{ id = "laya" }]

[providers.local-translate]
type = "ctranslate2"
models = [{ id = "gaudi/opus-mt-ru-en-ctranslate2" }]

[providers.chat]
base_url = "http://a/v1"
models = [{ id = "m" }]
`) as Provider[];
		expect(laya?.models[0]?.types).toEqual(["decision"]);
		expect(translate?.models[0]?.types).toEqual(["translation"]);
		expect(chat?.models[0]?.types).toEqual(["language"]);
		expect(stringifyProviders([laya as Provider])).not.toContain(
			'type = "systemone"',
		);
	});

	test("a provider of translation models needs no base_url, the others do; it is written without one", () => {
		const toml = `[providers.local-translate]
models = [{ id = "gaudi/opus-mt-ru-en-ctranslate2", type = "translation" }]
`;
		const p = parseProviders(toml)[0] as Provider;
		expect(p).toMatchObject({ baseUrl: "" });
		expect(p.models[0]?.types).toEqual(["translation"]);
		expect(stringifyProviders([p])).not.toContain("base_url");
		expect(parseProviders(stringifyProviders([p]))).toEqual([p]);
		expect(() => parseProviders('[providers.x]\nname = "x"\n')).toThrow(
			"base_url is required",
		);
	});

	test("a ctranslate2 server is seeded without a base URL and without a key", () => {
		const model = {
			id: "org/m",
			name: "org/m",
			types: ["translation" as const],
			extraBody: {},
		};
		expect(
			seedProviders([
				{
					id: "local-translate",
					baseUrl: "",
					apiKeyVar: "",
					model,
				},
			]),
		).toEqual([
			{
				id: "local-translate",
				name: "local-translate",
				baseUrl: "",
				apiKey: "",
				models: [model],
			},
		]);
	});

	test("seeding from env: one provider per base URL, keys as env references, no server = skipped", () => {
		const model = (id: string, type: "language" | "decision" = "language") => ({
			id,
			name: id,
			types: [type],
			extraBody: {},
		});
		expect(
			seedProviders([
				{
					id: "local-text",
					baseUrl: "http://a/v1",
					apiKeyVar: "A",
					model: model("m1"),
				},
				{
					id: "local-fc",
					baseUrl: "http://a/v1",
					apiKeyVar: "B",
					model: model("m2"),
				},
				{ id: "none", baseUrl: "", apiKeyVar: "C", model: model("m3") },
				{
					id: "local-decision",
					baseUrl: "http://g:8080",
					apiKeyVar: "D",
					model: model("laya", "decision"),
				},
			]),
		).toEqual([
			{
				id: "local-text",
				name: "local-text",
				baseUrl: "http://a/v1",
				apiKey: "$A",
				models: [model("m1"), model("m2")],
			},
			{
				id: "local-decision",
				name: "local-decision",
				baseUrl: "http://g:8080",
				apiKey: "$D",
				models: [model("laya", "decision")],
			},
		]);
	});

	test("a key shows as a mask; an env reference shows as is", () => {
		expect(maskKey("sk-or-v1-secret1234")).toBe("••••1234");
		expect(maskKey("$OLLAMA_KEY")).toBe("$OLLAMA_KEY");
		expect(maskKey("")).toBe("");
	});

	test("upserts and removals keep the rest; a missing provider is refused", () => {
		const one = upsertProvider([], {
			id: "a",
			name: "A",
			baseUrl: "http://a/v1",
			apiKey: "k1",
		});
		const withModel = upsertModel(one, "a", {
			id: "m",
			name: "M",
			types: ["language"],
			extraBody: {},
		});
		// No apiKey in the input = keep the stored one.
		const renamed = upsertProvider(withModel, {
			id: "a",
			name: "A2",
			baseUrl: "http://a2/v1",
		});
		expect(renamed).toEqual([
			{
				id: "a",
				name: "A2",
				baseUrl: "http://a2/v1",
				apiKey: "k1",
				models: [{ id: "m", name: "M", types: ["language"], extraBody: {} }],
			},
		]);
		expect(removeModel(renamed, "a", "m")[0]?.models).toEqual([]);
		expect(() =>
			upsertModel([], "nope", {
				id: "m",
				name: "m",
				types: ["language"],
				extraBody: {},
			}),
		).toThrow(ProvidersConfigError);
	});

	test("an existing file without a model of a seeded type gets that seeded provider; others are left alone", async () => {
		await inTempDir(async (dir) => {
			const path = join(dir, "providers.toml");
			await Bun.write(path, TOML);
			const laya: Provider = {
				id: "local-decision",
				name: "local-decision",
				baseUrl: "http://laya:8090",
				apiKey: "$LAYA_API_KEY",
				models: [
					{ id: "laya", name: "laya", types: ["decision"], extraBody: {} },
				],
			};
			const seed = () => [{ ...OPENROUTER, id: "local-text" }, laya];
			const config = await createProvidersConfig({ path, seed });
			expect(config.providers().map((p) => p.id)).toEqual([
				"openrouter",
				"ollama",
				"local-decision",
			]);
			expect(await Bun.file(path).text()).toContain(
				"[providers.local-decision]",
			);
			const again = await createProvidersConfig({ path, seed });
			expect(again.providers()).toHaveLength(3);
		});
	});

	test("a missing file is seeded and written 0600; text() masks keys; a masked key saved back keeps the stored one", async () => {
		await inTempDir(async (dir) => {
			const path = join(dir, "providers.toml");
			const config = await createProvidersConfig({
				path,
				seed: () => [OPENROUTER],
				env: { OLLAMA_KEY: "ol-key" },
			});
			expect(config.providers()).toEqual([OPENROUTER]);
			expect((await stat(path)).mode & 0o777).toBe(0o600);
			expect(config.text()).not.toContain("secret");
			expect(config.text()).toContain('api_key = "••••1234"');

			await config.save(
				`${config.text()}\n[providers.ollama]\nbase_url = "http://o/v1"\napi_key = "$OLLAMA_KEY"\n`,
			);
			expect(config.providers()[0]?.apiKey).toBe("sk-or-v1-secret1234");
			expect(config.resolveKey(config.providers()[1]?.apiKey ?? "")).toBe(
				"ol-key",
			);
			await expect(
				config.save(
					'[providers.x]\nbase_url = "https://x/v1"\napi_key = "••••9999"',
				),
			).rejects.toThrow(/key/);
			await config.update((providers) => providers.slice(0, 1));
			expect(
				(await Bun.file(path).text()).includes("sk-or-v1-secret1234"),
			).toBe(true);
			expect(config.providers().map((p) => p.id)).toEqual(["openrouter"]);
		});
	});
});

describe("check (prepareProviders)", () => {
	const OK = `[providers.a]\nbase_url = "http://a/v1"\n`;
	const errors = (toml: string, stored: Provider[] = []) =>
		prepareProviders(toml, stored).errors;

	test("empty file and a lone #:schema line are valid", () => {
		expect(errors("")).toEqual([]);
		expect(errors("#:schema ./providers.schema.json\n")).toEqual([]);
		expect(errors(OK)).toEqual([]);
	});

	test.each([
		["unterminated table header", "[providers.a\n", /table header/],
		["missing value after =", `${OK}name =\n`, /Missing value/],
		["unclosed string", `${OK}name = "abc\n`, /Unterminated/],
		["duplicate table", `${OK}[providers.a]\n`, /redefine/],
		["garbage text", "garbage text", /Expected '='/],
	])("syntax: %s -> line, no path", (_n, toml, message) => {
		const [error, ...rest] = errors(toml);
		expect(rest).toEqual([]);
		expect(error?.message).toMatch(message);
		expect(error?.path).toBeUndefined();
		expect(error?.line).toBeGreaterThan(0);
	});

	test("syntax error line is 1-based and points at the failing line", () => {
		expect(errors("[providers.a\n")[0]?.line).toBe(1);
		expect(errors(`${OK}\nname =\n`)[0]?.line).toBe(4);
		expect(errors(`${OK}\nx = 1\ny = 2\nname = "abc\n`)[0]?.line).toBe(6);
		// an unclosed multi-line array is not blamed on the line that opens it
		expect(errors("a = [\n1,\n2,\n]]\n")[0]?.line).toBe(4);
	});

	test.each([
		['temperature = "hot"', "providers.a.models.0.temperature"],
		["temperature = 3", "providers.a.models.0.temperature"],
		['reasoning_effort = "extreme"', "providers.a.models.0.reasoning_effort"],
	])("schema: %s", (field, path) => {
		const toml = `${OK}[[providers.a.models]]\nid = "m"\n${field}\n`;
		const [error, ...rest] = errors(toml);
		expect(rest).toEqual([]);
		expect(error).toMatchObject({ path });
		expect(error?.line).toBeUndefined();
	});

	test("schema: bad id, non-http url, models not an array", () => {
		expect(
			errors(`[providers.X_Y]\nbase_url = "http://a"\n`)[0]?.message,
		).toMatch(/provider id/);
		expect(errors(`[providers.a]\nbase_url = "ftp://a/v1"\n`)[0]?.path).toBe(
			"providers.a.base_url",
		);
		expect(errors(`${OK}models = "m"\n`)[0]?.path).toBe("providers.a.models");
	});

	test("all schema issues come together", () => {
		const paths = errors(
			`[providers.a]\nbase_url = "ftp://a"\nmodels = [{ id = "m", temperature = 9 }, { id = "n", reasoning_effort = "x" }]\n`,
		).map((e) => e.path);
		expect(paths).toEqual([
			"providers.a.base_url",
			"providers.a.models.0.temperature",
			"providers.a.models.1.reasoning_effort",
		]);
	});

	test("a forged masked key is refused, the matching one resolves to the stored key", () => {
		const stored = [{ ...OPENROUTER }];
		const forged = `[providers.openrouter]\nbase_url = "http://a/v1"\napi_key = "••••9999"\n`;
		expect(errors(forged, stored)).toEqual([
			expect.objectContaining({ path: "providers.openrouter.api_key" }),
		]);
		expect(errors(forged.replace("9999", "1234"), stored)).toEqual([]);
		expect(errors(forged.replace("9999", "1234"), [])).toHaveLength(1);
		const ok = prepareProviders(forged.replace("9999", "1234"), stored);
		expect(ok.providers[0]?.apiKey).toBe("sk-or-v1-secret1234");
		expect(JSON.stringify(ok.errors)).not.toContain("secret");
	});

	test("config.check never writes the file", async () => {
		await inTempDir(async (dir) => {
			const path = join(dir, "providers.toml");
			const config = await createProvidersConfig({
				path,
				seed: () => [OPENROUTER],
			});
			const before = await Bun.file(path).text();
			expect(config.check(`${OK}[providers.a]\n`)).toHaveLength(1);
			expect(config.check(OK)).toEqual([]);
			expect(await Bun.file(path).text()).toBe(before);
			expect(config.providers()).toEqual([OPENROUTER]);
		});
	});
});

test("stringify starts with the #:schema line and the example file does too", async () => {
	expect(stringifyProviders([])).toStartWith(
		"#:schema ./providers.schema.json\n",
	);
	const example = join(
		import.meta.dir,
		"../../../configs/providers.example.toml",
	);
	expect(await Bun.file(example).text()).toStartWith(
		"#:schema ./providers.schema.json\n",
	);
});

test("configs/providers.schema.json is up to date (run `bun run providers:schema`)", async () => {
	const file = join(import.meta.dir, "../../../configs/providers.schema.json");
	expect(
		await Bun.file(file).text(),
		"stale: run `bun run providers:schema`",
	).toBe(providersSchemaText());
	// the parser drops extra Crush fields, so the schema must not reject them
	expect(providersSchemaText()).not.toContain('"additionalProperties": false');
});
