import { type Static, t } from "elysia";
import { nullable, PageQuery } from "../common/common.schema.ts";
import { PlanStatus } from "../subscriptions/subscriptions.schema.ts";

/** One row of the staff "Users" table. Timestamps are epoch ms. */
export const Customer = t.Object({
	id: t.String(),
	name: t.String(),
	email: t.String(),
	emailVerified: t.Boolean(),
	createdAt: t.Number(),
	/** Null = never active since sign-up. */
	lastActiveAt: t.Nullable(t.Number()),
	banned: t.Boolean(),
	channelsCount: t.Number(),
	/** The account's current Polar plan (a running one, else the latest); `null` = never subscribed. */
	plan: nullable(
		t.Object({ status: PlanStatus, currentPeriodEnd: nullable(t.Number()) }),
	),
});

export const CustomersQuery = PageQuery;

export const CustomersPage = t.Object({
	items: t.Array(Customer),
	total: t.Number(),
});

export type Customer = Static<typeof Customer>;
export type CustomersPage = Static<typeof CustomersPage>;
