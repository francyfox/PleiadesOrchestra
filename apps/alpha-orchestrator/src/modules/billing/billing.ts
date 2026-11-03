import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import { PolarWebhookResult } from "./billing.schema.ts";
import {
	accountOf,
	applyWebhook,
	type BillingProducts,
	InvalidPayloadError,
	syncFromPolar,
	verifyWebhook,
} from "./billing.service.ts";

export interface BillingDeps {
	db: Db;
	webhookSecret: string;
	now: () => number;
	products?: BillingProducts;
	/** Logged: events that change no row (other types, no `external_id`). */
	log?: (message: string) => void;
	/** An applied webhook changed this account's plan or balance (the Polar customer's `external_id`). */
	onAccountChanged?: (accountId: string) => void;
}

/**
 * Polar webhook receiver. Public (Polar has no bearer key): the signature is
 * the credential. `parse: "text"` keeps the raw body, which is what was signed.
 */
export function billingRoutes({
	db,
	webhookSecret,
	now,
	products,
	log,
	onAccountChanged,
}: BillingDeps) {
	return new Elysia({ prefix: "/v1/billing", tags: ["Billing"] }).post(
		"/polar",
		({ body, request, status }) => {
			const rawBody = typeof body === "string" ? body : "";
			const id = request.headers.get("webhook-id");
			const signed = verifyWebhook(
				webhookSecret,
				{
					id,
					timestamp: request.headers.get("webhook-timestamp"),
					signature: request.headers.get("webhook-signature"),
				},
				rawBody,
				now(),
			);
			if (!id || !signed) return status(401, "Invalid signature");

			let event: unknown;
			try {
				event = JSON.parse(rawBody);
			} catch {
				return status(400, "Invalid JSON");
			}
			try {
				const outcome = applyWebhook(db, id, event, now(), products);
				if (outcome === "applied") {
					const owner = accountOf((event as { data?: unknown }).data);
					if (owner) onAccountChanged?.(owner);
				}
				if (outcome === "logged")
					log?.(`polar webhook ${(event as { type?: string }).type}`);
				return outcome === "duplicate"
					? { ok: true, duplicate: true }
					: { ok: true };
			} catch (error) {
				if (error instanceof InvalidPayloadError)
					return status(400, error.message);
				throw error;
			}
		},
		{
			parse: "text",
			response: { 200: PolarWebhookResult, 400: t.String(), 401: t.String() },
			detail: {
				summary: "Receive a Polar webhook",
				description:
					"Public; the Standard Webhooks signature (`webhook-id`, `webhook-timestamp`, `webhook-signature` headers) is the credential. 401 invalid signature, 400 invalid JSON or payload. `duplicate: true` when the webhook id was already handled.",
			},
		},
	);
}

/** Admin route: staff "Sync Polar". admin-api fetches Polar's lists (it holds the token) and posts them here. Auth is the app's `onRequest` guard. */
export function billingSyncRoutes({
	db,
	now,
	products,
	onAccountChanged,
}: Omit<BillingDeps, "webhookSecret" | "log">) {
	return new Elysia({ prefix: "/v1/admin/billing", tags: ["Billing"] }).post(
		"/sync",
		({ body }) => {
			const { accounts, ...counts } = syncFromPolar(db, body, now(), products);
			for (const account of accounts) onAccountChanged?.(account);
			return counts;
		},
		{
			body: t.Object({
				subscriptions: t.Array(t.Unknown()),
				orders: t.Array(t.Unknown()),
			}),
			response: {
				200: t.Object({
					applied: t.Number(),
					unchanged: t.Number(),
					skipped: t.Number(),
				}),
			},
			detail: {
				summary: "Apply Polar's subscriptions and orders",
				description:
					"Polar objects as its list endpoints return them. Applied like webhooks (same account mapping, `modified_at` order, one ledger top-up per order); only paid orders. `unchanged` = already applied snapshots.",
			},
		},
	);
}
