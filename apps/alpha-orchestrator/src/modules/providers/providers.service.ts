import { chmod } from "node:fs/promises";
import { z } from "zod";

export const REASONING_EFFORTS = ["none", "low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** A model of a provider with the request parameters it is called with. */
export interface ProviderModel {
	id: string;
	name: string;
	temperature?: number;
	reasoningEffort?: ReasoningEffort;
	/** Extra request-body fields, e.g. `{ provider: { require_parameters: true } }` for OpenRouter. */
	extraBody: Record<string, unknown>;
}

/** An OpenAI-compatible server from `configs/providers.toml`. */
export interface Provider {
	id: string;
	name: string;
	baseUrl: string;
	/** As written: the key, `$ENV_VAR`, or "" for none. Never leaves the process (see `maskKey`). */
	apiKey: string;
	models: ProviderModel[];
}

/** The TOML doesn't parse or doesn't fit the shape, or an edit refers to nothing: the route answers 400. */
export class ProvidersConfigError extends Error {}

export const PROVIDER_ID = /^[a-z0-9][a-z0-9-]*$/;

// Crush-like shape; fields we don't use (context_window, …) are accepted and dropped.
const Schema = z.object({
	providers: z
		.record(
			z.string().regex(PROVIDER_ID, "provider id: a-z, 0-9, -"),
			z.object({
				name: z.string().min(1).optional(),
				base_url: z.url({ protocol: /^https?$/ }),
				type: z.literal("openai-compat").optional(),
				api_key: z.string().optional(),
				models: z
					.array(
						z.object({
							id: z.string().min(1),
							name: z.string().optional(),
							temperature: z.number().min(0).max(2).optional(),
							reasoning_effort: z.enum(REASONING_EFFORTS).optional(),
							extra_body: z.record(z.string(), z.unknown()).optional(),
						}),
					)
					.default([]),
			}),
		)
		.default({}),
});

/** What the check reports: `line` (1-based) for a TOML syntax error, `path` for a schema error. */
export interface CheckError {
	message: string;
	line?: number;
	path?: string;
}

/** Bun's TOML error has no position (`line`/`column` on it are the JS call site), so find the first line whose prefix fails the same way. */
function syntaxLine(toml: string, message: string): number | undefined {
	const lines = toml.split("\n");
	// shortcut: quadratic re-parse, skipped for long files; upgrade if configs grow past a few hundred lines.
	if (lines.length > 1000) return undefined;
	for (let n = 1; n <= lines.length; n++) {
		try {
			Bun.TOML.parse(
				lines.slice(0, n).join("\n") + (n < lines.length ? "\n" : ""),
			);
		} catch (error) {
			if (error instanceof Error && error.message === message) return n;
		}
	}
	return undefined;
}

/** Syntax and schema, nothing else. */
function analyze(toml: string): {
	providers: Provider[];
	errors: CheckError[];
} {
	let raw: unknown;
	try {
		raw = Bun.TOML.parse(toml);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const line = syntaxLine(toml, message);
		return {
			providers: [],
			errors: [{ message, ...(line ? { line } : {}) }],
		};
	}
	const parsed = Schema.safeParse(raw);
	if (!parsed.success)
		return {
			providers: [],
			errors: parsed.error.issues.map((i) => ({
				// a bad record key says only "Invalid key"; its own issue has our message
				message:
					(i.code === "invalid_key" && i.issues[0]?.message) || i.message,
				path: i.path.join("."),
			})),
		};
	return {
		providers: Object.entries(parsed.data.providers).map(([id, p]) => ({
			id,
			name: p.name ?? id,
			baseUrl: p.base_url,
			apiKey: p.api_key ?? "",
			models: p.models.map((m) => ({
				id: m.id,
				name: m.name ?? m.id,
				...(m.temperature === undefined ? {} : { temperature: m.temperature }),
				...(m.reasoning_effort ? { reasoningEffort: m.reasoning_effort } : {}),
				extraBody: m.extra_body ?? {},
			})),
		})),
		errors: [],
	};
}

const toError = (errors: CheckError[]) =>
	new ProvidersConfigError(
		errors
			.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message))
			.join("\n"),
	);

export function parseProviders(toml: string): Provider[] {
	const { providers, errors } = analyze(toml);
	if (errors.length) throw toError(errors);
	return providers;
}

/** Edited text against the saved providers: what `save` writes, or why not. A key left masked is the stored key of that provider. */
export function prepareProviders(
	toml: string,
	stored: Provider[],
): { providers: Provider[]; errors: CheckError[] } {
	const analyzed = analyze(toml);
	if (analyzed.errors.length) return analyzed;
	const errors: CheckError[] = [];
	const providers = analyzed.providers.map((p) => {
		if (!p.apiKey.startsWith(MASK)) return p;
		const key = stored.find((old) => old.id === p.id)?.apiKey;
		if (!key || maskKey(key) !== p.apiKey) {
			errors.push({
				message:
					"enter the key again (a masked key only stands for the saved one)",
				path: `providers.${p.id}.api_key`,
			});
			return p;
		}
		return { ...p, apiKey: key };
	});
	return { providers, errors };
}

/** JSON Schema of the file for editors (Taplo, Tombi): the input side, so fields the parser drops (`context_window`) are not flagged. */
export const providersSchemaText = () =>
	`${JSON.stringify(z.toJSONSchema(Schema, { io: "input" }), null, "\t")}\n`;

// --- writing TOML (Bun only parses it) -------------------------------------------

/** JSON strings are valid TOML basic strings. */
const str = (value: string) => JSON.stringify(value);
const key = (name: string) =>
	/^[A-Za-z0-9_-]+$/.test(name) ? name : str(name);

function value(v: unknown): string {
	if (typeof v === "string") return str(v);
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	if (Array.isArray(v)) return `[${v.map(value).join(", ")}]`;
	if (v && typeof v === "object")
		return `{ ${Object.entries(v)
			.map(([k, item]) => `${key(k)} = ${value(item)}`)
			.join(", ")} }`;
	throw new ProvidersConfigError("extra_body: TOML has no null");
}

/** The whole file from the providers; comments of a hand-edited file are not kept. */
export function stringifyProviders(providers: Provider[]): string {
	const lines: string[] = ["#:schema ./providers.schema.json", ""];
	for (const p of providers) {
		lines.push(`[providers.${p.id}]`, `name = ${str(p.name)}`);
		lines.push(`base_url = ${str(p.baseUrl)}`, `type = "openai-compat"`);
		if (p.apiKey) lines.push(`api_key = ${str(p.apiKey)}`);
		lines.push("");
		for (const m of p.models) {
			lines.push(`[[providers.${p.id}.models]]`, `id = ${str(m.id)}`);
			if (m.name !== m.id) lines.push(`name = ${str(m.name)}`);
			if (m.temperature !== undefined)
				lines.push(`temperature = ${m.temperature}`);
			if (m.reasoningEffort)
				lines.push(`reasoning_effort = ${str(m.reasoningEffort)}`);
			if (Object.keys(m.extraBody).length)
				lines.push(`extra_body = ${value(m.extraBody)}`);
			lines.push("");
		}
	}
	return lines.join("\n");
}

// --- keys -------------------------------------------------------------------------

const MASK = "••••";

/** All the panel ever sees of a key; an env reference is not a secret and shows as is. */
export function maskKey(raw: string): string {
	if (!raw || raw.startsWith("$")) return raw;
	return `${MASK}${raw.slice(-4)}`;
}

// --- edits (the forms) --------------------------------------------------------------

/** Adds or replaces a provider; no `apiKey` keeps the stored one, "" removes it. Its models stay. */
export function upsertProvider(
	providers: Provider[],
	input: Omit<Provider, "models" | "apiKey"> & { apiKey?: string },
): Provider[] {
	if (!PROVIDER_ID.test(input.id))
		throw new ProvidersConfigError("provider id: a-z, 0-9, -");
	const old = providers.find((p) => p.id === input.id);
	const next: Provider = {
		...input,
		apiKey: input.apiKey ?? old?.apiKey ?? "",
		models: old?.models ?? [],
	};
	return old
		? providers.map((p) => (p === old ? next : p))
		: [...providers, next];
}

export function removeProvider(providers: Provider[], id: string): Provider[] {
	return providers.filter((p) => p.id !== id);
}

/** Adds or replaces a model (by id) of an existing provider. */
export function upsertModel(
	providers: Provider[],
	providerId: string,
	model: ProviderModel,
): Provider[] {
	if (!providers.some((p) => p.id === providerId))
		throw new ProvidersConfigError(`no provider "${providerId}"`);
	return providers.map((p) =>
		p.id !== providerId
			? p
			: {
					...p,
					models: p.models.some((m) => m.id === model.id)
						? p.models.map((m) => (m.id === model.id ? model : m))
						: [...p.models, model],
				},
	);
}

export function removeModel(
	providers: Provider[],
	providerId: string,
	modelId: string,
): Provider[] {
	return providers.map((p) =>
		p.id !== providerId
			? p
			: { ...p, models: p.models.filter((m) => m.id !== modelId) },
	);
}

/** First-start providers from the env servers: one provider per base URL, keys as `$VAR` references (no secret copied into the file). */
export function seedProviders(
	servers: {
		id: string;
		baseUrl: string;
		apiKeyVar: string;
		model: ProviderModel;
	}[],
): Provider[] {
	const seeded: Provider[] = [];
	for (const server of servers) {
		if (!server.baseUrl) continue;
		const same = seeded.find((p) => p.baseUrl === server.baseUrl);
		if (!same)
			seeded.push({
				id: server.id,
				name: server.id,
				baseUrl: server.baseUrl,
				apiKey: `$${server.apiKeyVar}`,
				models: [server.model],
			});
		else if (!same.models.some((m) => m.id === server.model.id))
			same.models.push(server.model);
	}
	return seeded;
}

// --- the file -------------------------------------------------------------------------

export interface ProvidersConfigDeps {
	path: string;
	/** Written when the file is missing (first start): today's env servers. */
	seed: () => Provider[];
	/** Resolves `$ENV_VAR` keys; defaults to `process.env`. */
	env?: Record<string, string | undefined>;
}

/**
 * `providers.toml`: read at startup (seeded if missing), rewritten by the admin
 * panel. It holds keys, so it is written 0600, gitignored and dockerignored,
 * and nothing that leaves the process carries a key (`text()` masks them).
 */
export async function createProvidersConfig(deps: ProvidersConfigDeps) {
	const env = deps.env ?? process.env;
	const file = Bun.file(deps.path);
	let providers: Provider[];

	async function write(next: Provider[]) {
		await Bun.write(deps.path, stringifyProviders(next));
		await chmod(deps.path, 0o600);
		providers = next;
	}

	if (await file.exists()) providers = parseProviders(await file.text());
	else await write(deps.seed());

	return {
		providers: () => providers,
		/** The file for the editor, keys masked. */
		text: () =>
			stringifyProviders(
				providers.map((p) => ({ ...p, apiKey: maskKey(p.apiKey) })),
			),
		resolveKey: (raw: string) =>
			raw.startsWith("$") ? (env[raw.slice(1)] ?? "") : raw,
		/** The errors `save` would stop at, without writing; never a key. */
		check: (toml: string) => prepareProviders(toml, providers).errors,
		/** Saves edited text; a key left masked is the stored key of that provider. */
		async save(toml: string) {
			const { providers: next, errors } = prepareProviders(toml, providers);
			if (errors.length) throw toError(errors);
			await write(next);
		},
		async update(edit: (current: Provider[]) => Provider[]) {
			await write(edit(providers));
		},
	};
}

export type ProvidersConfig = Awaited<ReturnType<typeof createProvidersConfig>>;
