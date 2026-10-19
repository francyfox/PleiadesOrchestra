import { Elysia } from "elysia";
import type { Db } from "../database/database.ts";
import {
	applyWebhook,
	InvalidPayloadError,
	verifyWebhook,
} from "./billing.service.ts";

export interface BillingDeps {
	db: Db;
	webhookSecret: string;
	now: () => number;
	/** Logged: payments (`order.paid`) and other events that change no row. */
	log?: (message: string) => void;
}

/**
 * Polar webhook receiver. Public (Polar has no bearer key): the signature is
 * the credential. `parse: "text"` keeps the raw body, which is what was signed.
 */
export function billingRoutes({ db, webhookSecret, now, log }: BillingDeps) {
	return new Elysia({ prefix: "/v1/billing" }).post(
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
				const outcome = applyWebhook(db, id, event, now());
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
		{ parse: "text" },
	);
}
