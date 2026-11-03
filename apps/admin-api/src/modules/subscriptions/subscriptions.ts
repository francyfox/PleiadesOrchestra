import { inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { polarErrors } from "../billing/billing.service.ts";
import { ApiError } from "../common/common.schema.ts";
import { schema } from "../database/database.ts";
import { Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { PlanStatus, Subscription } from "./subscriptions.schema.ts";

export function subscriptionsRoutes({
	auth,
	orchestrator,
	db,
	polar,
}: RouteDeps) {
	return new Elysia({ name: "admin-api.subscriptions", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(polarErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.post(
					"/subscriptions/sync",
					async ({ admin, status }) => {
						if (!polar) return status(503, { error: "billing_unavailable" });
						const [subscriptions, orders] = await Promise.all([
							polar.subscriptions(),
							polar.orders(),
						]);
						return orchestrator
							.as(admin.id)
							.syncBilling({ subscriptions, orders });
					},
					{
						response: {
							200: t.Object({
								applied: t.Number(),
								unchanged: t.Number(),
								skipped: t.Number(),
							}),
							// Spelled out, not `...Upstream` (`as const`): `status(503, …)` must type-check.
							401: ApiError,
							403: ApiError,
							404: ApiError,
							502: ApiError,
							503: ApiError,
						},
						detail: {
							summary: "Sync subscriptions and orders from Polar (staff)",
							description:
								"Reads every subscription and order from Polar and applies them in the orchestrator like webhooks: catches up on missed deliveries. `billing_unavailable` (503) without a Polar token; `billing_failed` (502) when Polar refuses (the token needs `subscriptions:read`, `orders:read`).",
						},
					},
				)
				.get(
					"/subscriptions",
					async ({ query }) => {
						const { items } = await orchestrator.listSubscriptions(query);
						const users = items.length
							? await db
									.select({ id: schema.user.id, email: schema.user.email })
									.from(schema.user)
									.where(
										inArray(
											schema.user.id,
											items.map((item) => item.accountId),
										),
									)
							: [];
						const emails = new Map(users.map((user) => [user.id, user.email]));
						return {
							items: items.map((item) => ({
								...item,
								accountEmail: emails.get(item.accountId) ?? null,
							})),
						};
					},
					{
						query: t.Object({
							status: t.Optional(PlanStatus),
							accountId: t.Optional(t.String()),
						}),
						response: {
							200: t.Object({ items: t.Array(Subscription) }),
							...Upstream,
						},
						detail: {
							summary: "Cloud subscriptions (Polar)",
							description:
								"Plans expiring within 7 days first, ended ones last, each with its owner's `accountId` and `accountEmail`. Filled by Polar's webhook in the orchestrator.",
						},
					},
				),
		);
}
