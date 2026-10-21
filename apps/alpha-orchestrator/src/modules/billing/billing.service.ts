import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
	billingWebhooks,
	creditLedger,
	orders,
	subscriptions,
} from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { MINUTE_MS } from "../http/http.service.ts";
import { centsToMicro } from "../ledger/ledger.service.ts";

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

const cents = (value: unknown) =>
	typeof value === "number" && Number.isInteger(value) ? value : null;

/** Polar products: the credits pack and the plan. With a plan id set, events of any other product are only logged; without, every non-credits product is a plan. */
export interface BillingProducts {
	creditsProductId?: string;
	planProductId?: string;
}

export type WebhookOutcome = "applied" | "duplicate" | "logged";

/**
 * Records the delivery (idempotent by `webhook-id`) and applies it. Every
 * `subscription.*` event carries the whole current subscription, so the row is
 * overwritten with it; an event whose `modified_at` is older than the stored one
 * (out-of-order delivery) is skipped, one without `modified_at` is last-write.
 * Accounts are Polar's `customer.external_id` (the admin-api user id); an event
 * without one is only logged. `order.paid` / `order.refunded` upsert the order; a
 * credits order tops the ledger up once (unique index) and a refund adds the
 * growth of `refunded_amount` as a negative row, so replays and either arrival
 * order give the same balance. Other types are only logged.
 */
export function applyWebhook(
	db: Db,
	webhookId: string,
	event: unknown,
	now: number,
	products: BillingProducts = {},
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
	const isOrder = type === "order.paid" || type === "order.refunded";
	const amount = cents(data.net_amount);
	if (isOrder && !(id && status && amount !== null))
		throw new InvalidPayloadError(`${type}: id, status, net_amount required`);
	const accountId = text(asObject(data.customer).external_id);

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
		if (!accountId || !id || !status) return "logged";
		const productId = text(data.product_id);
		const { creditsProductId, planProductId } = products;
		if (
			planProductId &&
			productId !== planProductId &&
			productId !== creditsProductId
		)
			return "logged";
		if (isOrder && amount !== null) {
			applyOrder(tx, { id, status, amount, accountId, data, now, products });
			return "applied";
		}
		if (!isSubscription || !customerId) return "logged";

		const customer = asObject(data.customer);
		const product = asObject(data.product);
		const values = {
			accountId,
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

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function applyOrder(
	tx: Tx,
	o: {
		id: string;
		status: string;
		amount: number;
		accountId: string;
		data: Json;
		now: number;
		products: BillingProducts;
	},
) {
	const productId = text(o.data.product_id);
	const kind: "plan" | "credits" =
		productId === o.products.creditsProductId ? "credits" : "plan";
	const before = tx.select().from(orders).where(eq(orders.id, o.id)).get();
	const sent = cents(o.data.refunded_amount) ?? 0;
	// A late `order.paid` carries the pre-refund state: the refund never shrinks.
	const stale = before !== undefined && sent < before.refundedAmount;
	const refunded = Math.max(sent, before?.refundedAmount ?? 0);
	const values = {
		accountId: o.accountId,
		productId,
		kind,
		amount: o.amount,
		currency: text(o.data.currency) ?? "usd",
		status: stale ? before.status : o.status,
		createdAt: ms(o.data.created_at) ?? before?.createdAt ?? o.now,
		refundedAmount: refunded,
	};
	tx.insert(orders)
		.values({ id: o.id, ...values })
		.onConflictDoUpdate({ target: orders.id, set: values })
		.run();
	if (kind !== "credits") return;
	tx.insert(creditLedger)
		.values({
			accountId: o.accountId,
			amount: centsToMicro(o.amount),
			reason: "top_up",
			ref: o.id,
			createdAt: o.now,
		})
		.onConflictDoNothing()
		.run();
	const delta = refunded - (before?.refundedAmount ?? 0);
	if (delta > 0)
		tx.insert(creditLedger)
			.values({
				accountId: o.accountId,
				amount: -centsToMicro(delta),
				reason: "refund",
				ref: o.id,
				createdAt: o.now,
			})
			.run();
}
