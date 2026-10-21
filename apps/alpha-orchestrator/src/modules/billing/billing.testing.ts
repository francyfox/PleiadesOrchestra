import { createHmac } from "node:crypto";

export const WEBHOOK_SECRET = `whsec_${Buffer.from("test-secret-bytes").toString("base64")}`;

/** Standard Webhooks signature of a body, as Polar sends it (base64 key after `whsec_`). */
export function sign(
	id: string,
	timestampSeconds: number,
	body: string,
	secret = WEBHOOK_SECRET,
) {
	const key = Buffer.from(secret.slice("whsec_".length), "base64");
	const signature = createHmac("sha256", key)
		.update(`${id}.${timestampSeconds}.${body}`)
		.digest("base64");
	return `v1,${signature}`;
}

/** A subscription as Polar's webhook payload carries it; override fields per test. */
export function subscriptionData(overrides: Record<string, unknown> = {}) {
	return {
		id: "sub_1",
		status: "active",
		customer_id: "cus_1",
		customer: {
			id: "cus_1",
			external_id: "acc_1",
			email: "owner@shop.example",
		},
		product_id: "prod_1",
		product: { id: "prod_1", name: "Cloud" },
		started_at: "2026-10-01T00:00:00Z",
		current_period_start: "2026-10-01T00:00:00Z",
		current_period_end: "2026-11-01T00:00:00Z",
		cancel_at_period_end: false,
		ended_at: null,
		modified_at: "2026-10-01T00:00:00Z",
		...overrides,
	};
}

/** An order as Polar's `order.paid` / `order.refunded` payload carries it (cents). */
export function orderData(overrides: Record<string, unknown> = {}) {
	return {
		id: "ord_1",
		status: "paid",
		product_id: "prod_credits",
		net_amount: 1000,
		refunded_amount: 0,
		currency: "usd",
		created_at: "2026-10-02T00:00:00Z",
		customer: { id: "cus_1", external_id: "acc_1" },
		...overrides,
	};
}

export function webhookRequest(options: {
	type: string;
	data?: unknown;
	id?: string;
	timestampSeconds: number;
	secret?: string;
	tamper?: boolean;
}) {
	const id = options.id ?? "msg_1";
	const body = JSON.stringify({
		type: options.type,
		timestamp: "2026-10-19T00:00:00Z",
		data: options.data ?? subscriptionData(),
	});
	return new Request("http://localhost/v1/billing/polar", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"webhook-id": id,
			"webhook-timestamp": String(options.timestampSeconds),
			"webhook-signature": sign(
				id,
				options.timestampSeconds,
				body,
				options.secret,
			),
		},
		body: options.tamper ? body.replace("owner@", "evil@") : body,
	});
}
