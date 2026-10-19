import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { billingWebhooks, subscriptions } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { MINUTE_MS } from "../http/http.service.ts";

/** Standard Webhooks: a timestamp further than this from now (either way) is a replay. */
export const WEBHOOK_TOLERANCE_MS = 5 * MINUTE_MS;

export class InvalidPayloadError extends Error {}

export interface WebhookHeaders {
	id: string | null;
	timestamp: string | null;
	signature: string | null;
}

/**
 * Signing keys to try. Polar's new endpoints follow Standard Webhooks (`whsec_`
 * + base64 key); older endpoints and user-provided secrets sign with the UTF-8
 * bytes of the whole secret string (the SDK base64-encodes it first). Both are
 * accepted, so rotating the secret needs no code change.
 */
function signingKeys(secret: string): Buffer[] {
	const keys = [Buffer.from(secret, "utf8")];
	if (secret.startsWith("whsec_"))
		keys.unshift(Buffer.from(secret.slice("whsec_".length), "base64"));
	return keys;
}

/** HMAC-SHA256 over `${id}.${timestamp}.${rawBody}`, checked against every `v1,<base64>` in the header, in constant time. */
export function verifyWebhook(
	secret: string,
	headers: WebhookHeaders,
	rawBody: string,
	nowMs: number,
): boolean {
	const { id, timestamp, signature } = headers;
	if (!id || !timestamp || !signature) return false;
	const seconds = Number(timestamp);
	if (!Number.isFinite(seconds)) return false;
	if (Math.abs(nowMs - seconds * 1000) > WEBHOOK_TOLERANCE_MS) return false;

	const given = signature
		.split(" ")
		.filter((part) => part.startsWith("v1,"))
		.map((part) => Buffer.from(part.slice(3), "base64"));
	return signingKeys(secret).some((key) => {
		const expected = createHmac("sha256", key)
			.update(`${id}.${timestamp}.${rawBody}`)
			.digest();
		return given.some(
			(candidate) =>
				candidate.length === expected.length &&
				timingSafeEqual(candidate, expected),
		);
	});
}

type Json = Record<string, unknown>;
const asObject = (value: unknown): Json =>
	value !== null && typeof value === "object" ? (value as Json) : {};
const text = (value: unknown) =>
	typeof value === "string" && value ? value : null;
const ms = (value: unknown) => {
	const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
	return Number.isNaN(parsed) ? null : parsed;
};

export type WebhookOutcome = "applied" | "duplicate" | "logged";

/**
 * Records the delivery (idempotent by `webhook-id`) and applies it. Every
 * `subscription.*` event carries the whole current subscription, so the row is
 * overwritten with it; an event whose `modified_at` is older than the stored one
 * (out-of-order delivery) is skipped, one without `modified_at` is last-write.
 * The channel link is never touched. `order.paid` and the rest are only logged.
 */
export function applyWebhook(
	db: Db,
	webhookId: string,
	event: unknown,
	now: number,
): WebhookOutcome {
	const { type, data: rawData } = asObject(event);
	const data = asObject(rawData);
	const isSubscription =
		typeof type === "string" && type.startsWith("subscription.");
	const id = text(data.id);
	const customerId = text(data.customer_id);
	const status = text(data.status);
	if (isSubscription && !(id && customerId && status))
		throw new InvalidPayloadError(`${type}: id, customer_id, status required`);

	return db.transaction((tx) => {
		const fresh = tx
			.insert(billingWebhooks)
			.values({
				id: webhookId,
				type: typeof type === "string" ? type : "unknown",
				receivedAt: now,
			})
			.onConflictDoNothing()
			.returning({ id: billingWebhooks.id })
			.all();
		if (fresh.length === 0) return "duplicate";
		if (!isSubscription || !id || !customerId || !status) return "logged";

		const customer = asObject(data.customer);
		const product = asObject(data.product);
		const values = {
			customerId,
			customerEmail: text(customer.email),
			productId: text(data.product_id),
			productName: text(product.name),
			status,
			startedAt: ms(data.started_at),
			currentPeriodStart: ms(data.current_period_start),
			currentPeriodEnd: ms(data.current_period_end),
			cancelAtPeriodEnd: data.cancel_at_period_end === true,
			endedAt: ms(data.ended_at),
			polarModifiedAt: ms(data.modified_at),
			updatedAt: now,
		};
		tx.insert(subscriptions)
			.values({ id, ...values })
			.onConflictDoUpdate({
				target: subscriptions.id,
				set: values,
				setWhere: sql`${subscriptions.polarModifiedAt} IS NULL OR ${values.polarModifiedAt} IS NULL OR ${values.polarModifiedAt} >= ${subscriptions.polarModifiedAt}`,
			})
			.run();
		return "applied";
	});
}
