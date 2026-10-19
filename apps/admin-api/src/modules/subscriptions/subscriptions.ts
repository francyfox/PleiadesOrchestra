import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { ApiError } from "../common/common.schema.ts";
import { Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { PlanStatus, Subscription } from "./subscriptions.schema.ts";

export function subscriptionsRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.subscriptions", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.get(
					"/subscriptions",
					({ query }) => orchestrator.listSubscriptions(query.status),
					{
						query: t.Object({ status: t.Optional(PlanStatus) }),
						response: {
							200: t.Object({ items: t.Array(Subscription) }),
							...Upstream,
						},
						detail: {
							summary: "Cloud subscriptions (Polar)",
							description:
								"Plans expiring within 7 days first, ended ones last. Filled by Polar's webhook in the orchestrator.",
						},
					},
				)
				.put(
					"/subscriptions/:id/channel",
					({ params, body, admin }) =>
						orchestrator
							.as(admin.id)
							.linkSubscriptionChannel(params.id, body.channelId),
					{
						params: t.Object({ id: t.String() }),
						body: t.Object({ channelId: t.Nullable(t.String()) }),
						response: { 200: Subscription, 400: ApiError, ...Upstream },
						detail: {
							summary: "Link a subscription to a channel, or unlink with null",
						},
					},
				),
		);
}
