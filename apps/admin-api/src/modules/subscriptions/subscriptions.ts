import { inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { schema } from "../database/database.ts";
import { Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { PlanStatus, Subscription } from "./subscriptions.schema.ts";

export function subscriptionsRoutes({ auth, orchestrator, db }: RouteDeps) {
	return new Elysia({ name: "admin-api.subscriptions", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app.get(
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
