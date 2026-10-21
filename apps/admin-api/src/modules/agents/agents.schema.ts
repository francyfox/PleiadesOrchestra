import { type Static, t } from "elysia";
import { nullable, oneOf } from "../common/common.schema.ts";

export const AgentRole = t.UnionEnum([
	"text",
	"decision",
	"function-call",
	"translate",
]);

export const AgentStatus = t.UnionEnum(["up", "down"]);

/** A model service the orchestrator talks to, with its last health probe. */
export const Agent = t.Object({
	id: t.String(),
	name: t.String(),
	role: AgentRole,
	/** Base URL without credentials. */
	endpoint: t.String(),
	model: nullable(t.String()),
	status: AgentStatus,
	latencyMs: nullable(t.Number()),
	checkedAt: t.Number(),
});

const ReasoningEffort = oneOf(["none", "low", "medium", "high"]);

/** One agent: the model in effect and its provider (null = the env server). Never a key. */
export const AgentSettingsView = t.Object({
	id: t.String(),
	provider: nullable(t.String()),
	model: t.String(),
	baseUrl: nullable(t.String()),
	updatedBy: nullable(t.String()),
	updatedAt: nullable(t.Number()),
});

/** A model of providers.toml, by provider id and model id. */
export const AgentPick = t.Object({
	provider: t.String({ minLength: 1, maxLength: 64 }),
	model: t.String({ minLength: 1, maxLength: 200 }),
});

/** A model with the parameters it is called with. */
export const ProviderModel = t.Object({
	id: t.String({ minLength: 1, maxLength: 200 }),
	name: t.String({ minLength: 1, maxLength: 200 }),
	temperature: t.Optional(t.Number({ minimum: 0, maximum: 2 })),
	reasoningEffort: t.Optional(ReasoningEffort),
	/** Extra request-body fields, e.g. `{ "provider": { "require_parameters": true } }` for OpenRouter. */
	extraBody: t.Record(t.String(), t.Any()),
});

/** A provider of providers.toml: the key masked (`••••1234`), `$VAR` as is, "" = none. */
export const Provider = t.Object({
	id: t.String(),
	name: t.String(),
	baseUrl: t.String(),
	/** `systemone` = Laya / TypeSafe Jev decisions (gamma-decision only). */
	type: oneOf(["openai-compat", "systemone", "ctranslate2"]),
	apiKey: t.String(),
	models: t.Array(ProviderModel),
});

export const ProviderList = t.Object({ items: t.Array(Provider) });

/** Add or change a provider; `apiKey` left out keeps the saved key, "" removes it. */
export const ProviderInput = t.Object({
	name: t.String({ minLength: 1, maxLength: 100 }),
	baseUrl: t.String({ pattern: "^https?://", maxLength: 500 }),
	apiKey: t.Optional(t.String({ maxLength: 500 })),
});

/** providers.toml as text, keys masked. */
export const ProvidersText = t.Object({
	toml: t.String({ maxLength: 100_000 }),
});

/** Why providers.toml would not save; empty = valid. `line` (1-based) for a syntax error, `path` for a schema error. */
export const ProvidersCheck = t.Object({
	errors: t.Array(
		t.Object({
			message: t.String(),
			line: t.Optional(t.Number()),
			path: t.Optional(t.String()),
		}),
	),
});

export const AgentTestResult = t.Object({
	ok: t.Boolean(),
	answer: t.Optional(t.String()),
	error: t.Optional(t.String()),
	latencyMs: t.Number(),
});

export type AgentSettingsView = Static<typeof AgentSettingsView>;
export type AgentPick = Static<typeof AgentPick>;
export type AgentTestResult = Static<typeof AgentTestResult>;
export type Provider = Static<typeof Provider>;
export type ProviderInput = Static<typeof ProviderInput>;
export type ProviderModel = Static<typeof ProviderModel>;
export type ProvidersText = Static<typeof ProvidersText>;
export type ProvidersCheck = Static<typeof ProvidersCheck>;
export type AgentRole = Static<typeof AgentRole>;
export type AgentStatus = Static<typeof AgentStatus>;
export type Agent = Static<typeof Agent>;
