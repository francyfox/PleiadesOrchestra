import {
	type Static,
	type TLiteral,
	type TUnion,
	Type,
} from "@sinclair/typebox";

// Browser-importable (the admin validates forms with these): import only `@sinclair/typebox`, never elysia or server code.

/** Not `Type.UnionEnum`: Elysia fills a missing `UnionEnum` field with its first value inside `Optional`. */
export const oneOf = <const T extends readonly string[]>(values: T) =>
	Type.Union(values.map((value) => Type.Literal(value))) as unknown as TUnion<{
		-readonly [K in keyof T]: TLiteral<T[K]>;
	}>;

const MODEL_TYPES = [
	"language",
	"embedding",
	"image",
	"video",
	"speech",
	"transcription",
	"reranking",
	"decision",
] as const;

/** A model with the parameters it is called with. */
export const ProviderModel = Type.Object({
	id: Type.String({ minLength: 1, maxLength: 200 }),
	name: Type.String({ minLength: 1, maxLength: 200 }),
	/** What the model can do (several for a multimodal one), as the AI SDK names its factories. */
	types: Type.Array(oneOf(MODEL_TYPES), { minItems: 1 }),
	temperature: Type.Optional(Type.Number({ minimum: 0, maximum: 2 })),
	reasoningEffort: Type.Optional(oneOf(["none", "low", "medium", "high"])),
	/** Extra request-body fields, e.g. `{ "provider": { "require_parameters": true } }` for OpenRouter. */
	extraBody: Type.Record(Type.String(), Type.Any()),
});

/** Add or change a provider; `apiKey` left out keeps the saved key, "" removes it. */
export const ProviderInput = Type.Object({
	name: Type.String({ minLength: 1, maxLength: 100 }),
	baseUrl: Type.String({ pattern: "^https?://", maxLength: 500 }),
	/** Where its decision models are asked; left out keeps the saved one. */
	decisionsUrl: Type.Optional(
		Type.String({ pattern: "^https?://", maxLength: 500 }),
	),
	apiKey: Type.Optional(Type.String({ maxLength: 500 })),
});

export type ProviderModel = Static<typeof ProviderModel>;
export type ProviderInput = Static<typeof ProviderInput>;

/** The provider dialog: `ProviderInput` plus the id that goes in the URL. */
export const ProviderForm = Type.Object({
	id: Type.String({ minLength: 1, maxLength: 64 }),
	...ProviderInput.properties,
});
