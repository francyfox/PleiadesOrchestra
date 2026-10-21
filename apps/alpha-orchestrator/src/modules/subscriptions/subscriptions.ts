import { Elysia } from "elysia";
import type { Db } from "../database/database.ts";
import {
	SubscriptionList,
	SubscriptionsQuery,
} from "./subscriptions.schema.ts";
import { listSubscriptions } from "./subscriptions.service.ts";

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
	}).get(
		"/",
		({ query }) => ({
			items: listSubscriptions(db, {
				status: query.status,
				accountId: query.accountId,
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
					"Polar subscriptions: plans expiring within 7 days first, then by expiry, ended ones last. `status` and `accountId` filter.",
			},
		},
	);
}
