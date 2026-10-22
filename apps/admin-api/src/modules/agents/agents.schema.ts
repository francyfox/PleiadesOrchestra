import { type Static, t } from "elysia";
import { AgentPick, ProviderInput, ProviderModel } from "../../forms/forms.ts";
import { nullable } from "../common/common.schema.ts";

export { AgentPick, ProviderInput, ProviderModel };

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
	/** How long the health probe took (the ping), not a model call. */
	latencyMs: nullable(t.Number()),
	/** Mean latency of the model's real, successful calls over the last 24 h; null when there were none. */
	responseMs: nullable(t.Number()),
	checkedAt: t.Number(),
});

/** One agent: the model in effect and its provider (null = the env server). Never a key. */
export const AgentSettingsView = t.Object({
	id: t.String(),
	provider: nullable(t.String()),
	model: t.String(),
	baseUrl: nullable(t.String()),
	updatedBy: nullable(t.String()),
	updatedAt: nullable(t.Number()),
});

/** A provider of providers.toml: the key masked (`••••1234`), `$VAR` as is, "" = none. */
export const Provider = t.Object({
	id: t.String(),
	name: t.String(),
	baseUrl: t.String(),
	/** Where its decision models are asked (Laya root or an OpenRouter-style `/decisions` URL); default `baseUrl`. */
	decisionsUrl: t.Optional(t.String()),
	apiKey: t.String(),
	models: t.Array(ProviderModel),
});

export const ProviderList = t.Object({ items: t.Array(Provider) });

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
	/** What was sent, in words (the prompt, or the fact and the question of a decision). */
	input: t.Optional(t.String()),
	/** The reply text; for a decision the likelier of true / false. */
	answer: t.Optional(t.String()),
	/** A decision's probability of "true". */
	probability: t.Optional(t.Number()),
	/** The model's own token counts, when it reports them. */
	inputTokens: t.Optional(t.Number()),
	outputTokens: t.Optional(t.Number()),
	error: t.Optional(t.String()),
	latencyMs: t.Number(),
});

export type AgentSettingsView = Static<typeof AgentSettingsView>;
export type AgentTestResult = Static<typeof AgentTestResult>;
export type Provider = Static<typeof Provider>;
export type ProvidersText = Static<typeof ProvidersText>;
export type ProvidersCheck = Static<typeof ProvidersCheck>;
export type AgentRole = Static<typeof AgentRole>;
export type AgentStatus = Static<typeof AgentStatus>;
export type Agent = Static<typeof Agent>;
