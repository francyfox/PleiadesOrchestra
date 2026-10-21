import { Elysia } from "elysia";
import { DAY_MS } from "../common/common.service.ts";
import { type AdminDb, schema } from "../database/database.ts";
import { buildMail } from "../mail/mail.service.ts";
import type { Mailer } from "../mail/mail.types.ts";
import type { AccountBilling, StandingView } from "./billing.schema.ts";

export type BillingKind = "plan" | "credits";
export type NoticeKind = "low_balance" | "plan_ending";

const LOW_BALANCE_USD = 1;
const PLAN_ENDING_MS = 3 * DAY_MS;

export class PolarError extends Error {
	override name = "PolarError";
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

/** A Polar failure is a 502 `billing_failed`; the cause stays in the server log via the error message. */
export const polarErrors = new Elysia({ name: "admin-api.polar-errors" })
	.error({ POLAR: PolarError })
	.onError({ as: "global" }, ({ code, set }) => {
		if (code !== "POLAR") return;
		set.status = 502;
		return { error: "billing_failed" };
	});

export interface PolarConfig {
	token: string;
	server: "sandbox" | "production";
	planProductId?: string;
	creditsProductId?: string;
	fetch?: typeof fetch;
}

/** Plain REST client for the three Polar calls admin-api needs; no SDK. */
export function createPolarClient(config: PolarConfig) {
	const base =
		config.server === "production"
			? "https://api.polar.sh"
			: "https://sandbox-api.polar.sh";
	const fetchFn = config.fetch ?? fetch;

	async function call<T>(
		method: string,
		path: string,
		body?: unknown,
	): Promise<T> {
		const response = await fetchFn(`${base}${path}`, {
			method,
			headers: {
				authorization: `Bearer ${config.token}`,
				...(body === undefined ? {} : { "content-type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		}).catch((cause) => {
			throw new PolarError(503, `${method} ${path}: unreachable (${cause})`);
		});
		if (!response.ok) {
			throw new PolarError(
				response.status,
				`${method} ${path} failed: ${response.status}`,
			);
		}
		return response.status === 204
			? (undefined as T)
			: ((await response.json()) as T);
	}

	const productFor = (kind: BillingKind) =>
		kind === "plan" ? config.planProductId : config.creditsProductId;

	return {
		productFor,
		/** A checkout for the signed-in user; Polar links the resulting customer by `external_customer_id`. */
		async checkout(
			kind: BillingKind,
			user: { id: string; email: string },
			successUrl: string,
			amountUsd?: number,
		): Promise<string> {
			const product = productFor(kind);
			if (!product) throw new PolarError(503, `no product for ${kind}`);
			const checkout = await call<{ url: string }>("POST", "/v1/checkouts/", {
				products: [product],
				external_customer_id: user.id,
				customer_email: user.email,
				success_url: successUrl,
				// Custom-price (pay what you want) products only; Polar ignores it for fixed ones.
				...(kind === "credits" && amountUsd ? { amount: amountUsd * 100 } : {}),
			});
			return checkout.url;
		},
		async portal(userId: string): Promise<string> {
			const session = await call<{ customer_portal_url: string }>(
				"POST",
				"/v1/customer-sessions/",
				{ external_customer_id: userId },
			);
			return session.customer_portal_url;
		},
		/** Ends the subscription at once (Polar "revoke"); one that is already gone counts as done. */
		async revoke(subscriptionId: string): Promise<void> {
			try {
				await call(
					"DELETE",
					`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
				);
			} catch (error) {
				if (!(error instanceof PolarError && error.status === 404)) throw error;
			}
		},
	};
}

export type PolarClient = ReturnType<typeof createPolarClient>;

/** Warnings due now: balance under 1 TR (exactly 1 is fine); a plan that holds to a set end within 3 days (exactly 3 counts). */
export function warnings(billing: AccountBilling, now: number): NoticeKind[] {
	const due: NoticeKind[] = [];
	if (billing.balanceUsd < LOW_BALANCE_USD) due.push("low_balance");
	const { standing } = billing;
	if (
		standing.ok &&
		standing.until !== null &&
		standing.until - now <= PLAN_ENDING_MS
	) {
		due.push("plan_ending");
	}
	return due;
}

export function standingView(
	billing: AccountBilling,
	now: number,
): StandingView {
	const { standing, balanceUsd } = billing;
	return {
		ok: standing.ok,
		reason: standing.ok ? null : standing.reason,
		since: standing.ok ? null : standing.since,
		until: standing.ok ? standing.until : null,
		balanceUsd,
		warn: warnings(billing, now).length > 0,
	};
}

/** shortcut: the low-balance period is the UTC month, so a second dip in the same month stays silent; use the top-up order id if that is too quiet. */
const periodOf = (kind: NoticeKind, billing: AccountBilling, now: number) =>
	kind === "plan_ending" && billing.standing.ok
		? String(billing.standing.until)
		: new Date(now).toISOString().slice(0, 7);

/** Mails each due warning once per period: the unique row is claimed first, so a repeat call sends nothing. */
export async function sendDueNotices(
	deps: {
		db: AdminDb;
		mailer: Mailer;
		panelUrl: string;
		now: number;
	},
	user: { id: string; email: string; locale?: string | null },
	billing: AccountBilling,
): Promise<void> {
	for (const kind of warnings(billing, deps.now)) {
		const claimed = await deps.db
			.insert(schema.accountNotices)
			.values({
				accountId: user.id,
				kind,
				period: periodOf(kind, billing, deps.now),
				sentAt: new Date(deps.now),
			})
			.onConflictDoNothing()
			.returning({ kind: schema.accountNotices.kind });
		if (claimed.length === 0) continue;
		await deps.mailer.send(
			buildMail(
				kind === "low_balance" ? "low-balance" : "plan-ending",
				user.email,
				`${deps.panelUrl}/billing`,
				user.locale,
			),
		);
	}
}
