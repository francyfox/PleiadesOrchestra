import { t } from "elysia";

export const ProviderId = t.String({
	pattern: "^[a-z0-9][a-z0-9-]*$",
	maxLength: 64,
});

const ReasoningEffort = t.Union([
	t.Literal("none"),
	t.Literal("low"),
	t.Literal("medium"),
	t.Literal("high"),
]);

/** One agent: the model in effect and where it came from. Never a key. */
export const AgentSettingsView = t.Object({
	id: t.String(),
	/** null = the env server (no model picked, or the picked one is gone). */
	provider: t.Nullable(t.String()),
	model: t.String(),
	/** Without login/password/query. */
	baseUrl: t.Nullable(t.String()),
	updatedBy: t.Nullable(t.String()),
	updatedAt: t.Nullable(t.Number()),
});

/** A model from providers.toml, by provider id and model id. */
export const AgentPick = t.Object({
	provider: ProviderId,
	model: t.String({ minLength: 1, maxLength: 200 }),
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

/** A model with the parameters it is called with. */
export const ProviderModel = t.Object({
	id: t.String({ minLength: 1, maxLength: 200 }),
	name: t.String({ minLength: 1, maxLength: 200 }),
	/** What the model can do (several for a multimodal one), as the AI SDK names its factories. */
	types: t.Array(
		t.Union([
			t.Literal("language"),
			t.Literal("embedding"),
			t.Literal("image"),
			t.Literal("video"),
			t.Literal("speech"),
			t.Literal("transcription"),
			t.Literal("reranking"),
			t.Literal("decision"),
		]),
		{ minItems: 1 },
	),
	temperature: t.Optional(t.Number({ minimum: 0, maximum: 2 })),
	reasoningEffort: t.Optional(ReasoningEffort),
	/** Extra request-body fields, e.g. `{ "provider": { "require_parameters": true } }` for OpenRouter. */
	extraBody: t.Record(t.String(), t.Any()),
});

/** A provider as the Models tab sees it: the key masked (`••••1234`), an env reference (`$VAR`) as is, "" = none. */
export const Provider = t.Object({
	id: t.String(),
	name: t.String(),
	baseUrl: t.String(),
	/** Where its decision models are asked (Laya root, or an OpenRouter-style `/decisions` URL); default `baseUrl`. */
	decisionsUrl: t.Optional(t.String()),
	apiKey: t.String(),
	models: t.Array(ProviderModel),
});

export const ProviderList = t.Object({ items: t.Array(Provider) });

/** Add or replace a provider; `apiKey` left out keeps the saved key, "" removes it. */
export const ProviderInput = t.Object({
	name: t.String({ minLength: 1, maxLength: 100 }),
	baseUrl: t.String({ pattern: "^https?://", maxLength: 500 }),
	/** Where its decision models are asked; left out keeps the saved one. */
	decisionsUrl: t.Optional(t.String({ pattern: "^https?://", maxLength: 500 })),
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
