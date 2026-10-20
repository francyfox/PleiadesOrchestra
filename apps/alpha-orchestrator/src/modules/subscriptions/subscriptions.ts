import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import {
	LinkChannelBody,
	Subscription,
	SubscriptionList,
	SubscriptionParams,
	SubscriptionsQuery,
} from "./subscriptions.schema.ts";
import {
	linkChannel,
	listSubscriptions,
	UnknownChannelError,
} from "./subscriptions.service.ts";

export interface SubscriptionsDeps {
	db: Db;
	now: () => number;
	/** `<dashboard url>/<subscription id>` is the link to Polar; unset = no link. */
	polarBaseUrl?: string;
}

/** Admin routes for Polar subscriptions. Auth is enforced by the app's `onRequest` guard. */
export function subscriptionsRoutes({
	db,
	now,
	polarBaseUrl,
}: SubscriptionsDeps) {
	return new Elysia({
		prefix: "/v1/admin/subscriptions",
		tags: ["Admin: subscriptions"],
	})
		.get(
			"/",
			({ query }) => ({
				items: listSubscriptions(db, {
					status: query.status,
					now: now(),
					polarBaseUrl,
				}),
			}),
			{
				query: SubscriptionsQuery,
				response: { 200: SubscriptionList },
				detail: {
					summary: "List subscriptions",
					description:
						"Polar subscriptions: plans expiring within 7 days first, then by expiry, ended ones last. `status` filters.",
				},
			},
		)
		.put(
			"/:id/channel",
			({ params, body, status }) => {
				try {
					return (
						linkChannel(db, params.id, body.channelId, polarBaseUrl) ??
						status(404, "Not found")
					);
				} catch (error) {
					if (error instanceof UnknownChannelError)
						return status(400, "Unknown channel");
					throw error;
				}
			},
			{
				params: SubscriptionParams,
				body: LinkChannelBody,
				response: { 200: Subscription, 400: t.String(), 404: t.String() },
				detail: {
					summary: "Link a subscription to a channel",
					description:
						"`channelId: null` unlinks. 404: no such subscription; 400: unknown channel.",
				},
			},
		);
}
