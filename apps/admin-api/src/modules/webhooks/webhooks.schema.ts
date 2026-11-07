import { type Static, t } from "elysia";
import { CreateWebhookInput, UpdateWebhookInput } from "../../forms/forms.ts";
import { nullable } from "../common/common.schema.ts";

export const Webhook = t.Object({
	id: t.String(),
	name: t.String(),
	url: t.String(),
	events: t.Array(t.String()),
	format: t.Union([
		t.Literal("json"),
		t.Literal("discord"),
		t.Literal("slack"),
		t.Literal("telegram"),
	]),
	enabled: t.Boolean(),
	lastStatus: nullable(t.Number()),
	lastError: nullable(t.String()),
	lastAt: nullable(t.Number()),
	createdAt: t.Number(),
});

export const WebhookEventInfo = t.Object({
	name: t.String(),
	scope: t.Union([
		t.Literal("customer"),
		t.Literal("owner"),
		t.Literal("staff"),
	]),
});

export const WebhooksList = t.Object({
	items: t.Array(Webhook),
	/** The event catalog, for the checkboxes (a customer is offered `scope: "customer"` only). */
	events: t.Array(WebhookEventInfo),
});

/** `secret` is shown once: on create and rotate. */
export const WebhookWithSecret = t.Object({
	item: Webhook,
	secret: t.String(),
});

export const WebhookResult = t.Object({ item: Webhook });

export const WebhookTestResult = t.Object({
	status: nullable(t.Number()),
	error: nullable(t.String()),
});

export { CreateWebhookInput, UpdateWebhookInput };

export type WebhookEventInfo = Static<typeof WebhookEventInfo>;
export type Webhook = Static<typeof Webhook>;
export type WebhooksList = Static<typeof WebhooksList>;
export type WebhookWithSecret = Static<typeof WebhookWithSecret>;
export type WebhookTestResult = Static<typeof WebhookTestResult>;
