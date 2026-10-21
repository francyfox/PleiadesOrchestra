import { Elysia } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { isStaff } from "../accounts/accounts.schema.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { ApiError } from "../common/common.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import {
	AccountBilling,
	CheckoutInput,
	StandingView,
	UrlOut,
} from "./billing.schema.ts";
import {
	polarErrors,
	sendDueNotices,
	standingView,
} from "./billing.service.ts";

/** shortcut: per process, a few seconds; the header polls this on every page. Drop it for a push from the Polar webhook when it matters. */
const STANDING_TTL_MS = 5000;

const Failures = {
	401: ApiError,
	403: ApiError,
	404: ApiError,
	502: ApiError,
	503: ApiError,
};

/**
 * The signed-in user's own billing (plan, trenni, orders, spend), Polar checkout and portal.
 * Staff have no billing: every route here answers them 403. Reads go to the orchestrator,
 * which owns the data; the account id is always the session's.
 */
export function billingRoutes({
	auth,
	orchestrator,
	polar,
	mailer,
	db,
	panelUrl,
	now,
}: RouteDeps) {
	const cache = new Map<string, { at: number; billing: AccountBilling }>();

	return new Elysia({
		name: "admin-api.billing",
		prefix: "/billing",
		tags: ["billing"],
	})
		.use(orchestratorErrors)
		.use(polarErrors)
		.use(requireAdmin(auth))
		.guard({ account: true }, (app) =>
			app
				.onBeforeHandle(({ account, status }) => {
					if (isStaff(account.level))
						return status(403, { error: "forbidden" });
				})
				.get("/", ({ account }) => orchestrator.getAccountBilling(account.id), {
					response: { 200: AccountBilling, ...Failures },
					detail: {
						summary: "Own billing (users)",
						description:
							"Standing, plan, trenni balance, orders and monthly spend of the signed-in user. Staff: `forbidden`, 403.",
					},
				})
				.get(
					"/standing",
					async ({ account }) => {
						const at = now();
						let hit = cache.get(account.id);
						if (!hit || at - hit.at >= STANDING_TTL_MS) {
							hit = {
								at,
								billing: await orchestrator.getAccountBilling(account.id),
							};
							cache.set(account.id, hit);
							await sendDueNotices(
								{ db, mailer, panelUrl, now: at },
								account,
								hit.billing,
							);
						}
						return standingView(hit.billing, at);
					},
					{
						response: { 200: StandingView, ...Failures },
						detail: {
							summary: "Own standing for the header alerts (users)",
							description:
								"`ok` false = channels are paused (`reason`, `since`); `warn` = balance under 1 TR or the plan ends within 3 days. The first read that finds `warn` mails the user once per period. Cached for 5 s per account.",
						},
					},
				)
				.post(
					"/checkout",
					async ({ body, account, status }) => {
						if (!polar?.productFor(body.kind))
							return status(503, { error: "billing_unavailable" });
						const url = await polar.checkout(
							body.kind,
							account,
							`${panelUrl}/billing?checkout=success`,
							body.amountUsd,
						);
						return { url };
					},
					{
						body: CheckoutInput,
						response: { 200: UrlOut, ...Failures },
						detail: {
							summary: "Start a Polar checkout (users)",
							description:
								"Returns the Polar checkout `url` for the plan or for trenni (`amountUsd` preselects the amount of a custom-price product). `billing_unavailable` (503) without a Polar token or the product id; `billing_failed` (502) when Polar refuses.",
						},
					},
				)
				.post(
					"/portal",
					async ({ account, status }) => {
						if (!polar) return status(503, { error: "billing_unavailable" });
						return { url: await polar.portal(account.id) };
					},
					{
						response: { 200: UrlOut, ...Failures },
						detail: {
							summary: "Polar customer portal link (users)",
							description:
								"Where the user manages the card and cancels the plan. `billing_unavailable` (503) without a Polar token; `billing_failed` (502) when Polar refuses (e.g. the user never paid).",
						},
					},
				),
		);
}
