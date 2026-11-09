/** The events a webhook can subscribe to: the single source for validation and the admin UI. */
export const WEBHOOK_EVENTS = [
	"webhook.test",
	"guardrail.blocked",
	"run.failed",
	"ip.blocked",
	"balance.low",
	"balance.depleted",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/**
 * Body shape of a delivery. `json` is the full signed event; the others are a one-line text in the
 * receiver's own field (Discord `content`, Slack and Telegram `text`) for an incoming-webhook URL the
 * user copied there (Telegram: `https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>`).
 */
export const WEBHOOK_FORMATS = [
	"json",
	"discord",
	"slack",
	"telegram",
] as const;
export type WebhookFormat = (typeof WEBHOOK_FORMATS)[number];

/**
 * Who may subscribe: `customer` events concern one account's own channels (delivered to that
 * owner's webhooks and to staff's); `owner` ones (the balance) exist for the account's own webhooks
 * only, staff has none; `staff` ones only to staff webhooks.
 */
export const WEBHOOK_EVENT_SCOPE: Record<
	WebhookEvent,
	"customer" | "owner" | "staff"
> = {
	"webhook.test": "customer",
	"guardrail.blocked": "customer",
	"run.failed": "customer",
	"ip.blocked": "staff",
	"balance.low": "owner",
	"balance.depleted": "owner",
};

/**
 * `data` of each event in the delivered `{id, event, at, data}` body. An event names
 * its `channelId` or `accountId`: that is how the owner is found, so keep other
 * tenants' data out of it.
 */
export interface WebhookEventData {
	"webhook.test": { message: string };
	"guardrail.blocked": {
		channelId: string | null;
		rule: string;
		reason: string;
	};
	/** A plan run that ended in error. */
	"run.failed": { runId: string; threadId: string; channelId: string | null };
	"ip.blocked": {
		ip: string;
		channelId: string | null;
		reason: string;
		expiresAt: number;
	};
	/** A debit took the TR balance from the threshold or above to below it (once per crossing). */
	"balance.low": {
		accountId: string;
		balanceUsd: number;
		thresholdUsd: number;
	};
	/** The balance no longer covers a request: the account's channels are refused (402). */
	"balance.depleted": {
		accountId: string;
		balanceUsd: number;
		channels: string[];
	};
}

/** Injected where events originate; never throws, never waits. */
export type Emit = <E extends WebhookEvent>(
	event: E,
	data: WebhookEventData[E],
) => void;

/** Resolves a host name to all its addresses. */
export type Resolve = (host: string) => Promise<string[]>;

export interface DeliveryResult {
	status: number | null;
	error: string | null;
}
