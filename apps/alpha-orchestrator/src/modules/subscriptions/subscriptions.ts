import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import { oneOf } from "../http/http.ts";
import {
	linkChannel,
	listSubscriptions,
	PLAN_STATUSES,
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
	return new Elysia({ prefix: "/v1/admin/subscriptions" })
		.get(
			"/",
			({ query }) => ({
				items: listSubscriptions(db, {
					status: query.status,
					now: now(),
					polarBaseUrl,
				}),
			}),
			{ query: t.Object({ status: t.Optional(oneOf(PLAN_STATUSES)) }) },
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
			{ body: t.Object({ channelId: t.Nullable(t.String()) }) },
		);
}
