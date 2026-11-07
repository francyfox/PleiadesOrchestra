import { type Static, Type } from "@sinclair/typebox";

// Browser-importable: import only `@sinclair/typebox`, never elysia or server code.

/** The orchestrator owns the event catalog (`GET /webhooks` returns it) and rejects unknown names. */
export const CreateWebhookInput = Type.Object({
	name: Type.String({ minLength: 1, maxLength: 100 }),
	url: Type.String({ minLength: 1, maxLength: 2000 }),
	events: Type.Array(Type.String(), { minItems: 1 }),
	/** Default `json`; the others post a one-line text (Discord, Slack, Telegram incoming webhooks). */
	format: Type.Optional(
		Type.Union([
			Type.Literal("json"),
			Type.Literal("discord"),
			Type.Literal("slack"),
			Type.Literal("telegram"),
		]),
	),
});

export const UpdateWebhookInput = Type.Object({
	name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
	url: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
	format: Type.Optional(
		Type.Union([
			Type.Literal("json"),
			Type.Literal("discord"),
			Type.Literal("slack"),
			Type.Literal("telegram"),
		]),
	),
	events: Type.Optional(Type.Array(Type.String(), { minItems: 1 })),
	enabled: Type.Optional(Type.Boolean()),
});

/** The edit dialog always submits every field plus the row's id. */
export const EditWebhookForm = Type.Composite([
	Type.Object({ id: Type.String({ minLength: 1 }) }),
	CreateWebhookInput,
]);

export type CreateWebhookInput = Static<typeof CreateWebhookInput>;
export type UpdateWebhookInput = Static<typeof UpdateWebhookInput>;
