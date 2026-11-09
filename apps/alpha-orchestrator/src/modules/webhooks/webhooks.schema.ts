import { t } from "elysia";
import { WEBHOOK_EVENTS, WEBHOOK_FORMATS } from "./webhooks.types.ts";

// UnionEnum, not `oneOf()`: inside an array it keeps the event-name type (oneOf over a readonly tuple types as never[]).
const EventName = t.UnionEnum([...WEBHOOK_EVENTS]);
const Events = t.Array(EventName, { minItems: 1 });
const Format = t.UnionEnum([...WEBHOOK_FORMATS]);
const Name = t.String({ minLength: 1, maxLength: 100 });

/** Never carries the secret: it is shown once, on create and rotate. */
export const Webhook = t.Object({
	id: t.String(),
	/** "" on webhooks made before names existed. */
	name: t.String(),
	url: t.String(),
	events: Events,
	format: Format,
	enabled: t.Boolean(),
	lastStatus: t.Nullable(t.Number()),
	lastError: t.Nullable(t.String()),
	lastAt: t.Nullable(t.Number()),
	createdAt: t.Number(),
});

export const WebhooksList = t.Object({
	items: t.Array(Webhook),
	/** The event catalog, for the admin's checkboxes. */
	events: t.Array(
		t.Object({
			name: EventName,
			scope: t.UnionEnum(["customer", "owner", "staff"]),
		}),
	),
});

/** `ownerId`: the customer's account id; left out = a staff webhook. */
export const CreateWebhookBody = t.Object({
	name: Name,
	url: t.String({ minLength: 1, maxLength: 2000 }),
	events: Events,
	/** Default `json`. */
	format: t.Optional(Format),
	ownerId: t.Optional(t.String({ minLength: 1 })),
});

export const UpdateWebhookBody = t.Object({
	name: t.Optional(Name),
	url: t.Optional(t.String({ minLength: 1, maxLength: 2000 })),
	format: t.Optional(Format),
	events: t.Optional(Events),
	enabled: t.Optional(t.Boolean()),
});

export const WebhookWithSecret = t.Object({
	item: Webhook,
	secret: t.String(),
});

export const WebhookResult = t.Object({ item: Webhook });

export const WebhookTestResult = t.Object({
	status: t.Nullable(t.Number()),
	error: t.Nullable(t.String()),
});
