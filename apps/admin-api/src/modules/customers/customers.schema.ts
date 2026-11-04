import { type Static, t } from "elysia";
import { nullable, oneOf, PageQuery } from "../common/common.schema.ts";
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
	/** TR balance (1 TR = 1 USD); 0 for an account without ledger rows. */
	balanceUsd: t.Number(),
	/** The account's current Polar plan (a running one, else the latest); `null` = never subscribed. */
	plan: nullable(
		t.Object({ status: PlanStatus, currentPeriodEnd: nullable(t.Number()) }),
	),
});

/** Columns of the Users table the server sorts by. */
export const CUSTOMER_SORTS = [
	"name",
	"email",
	"createdAt",
	"lastActiveAt",
	"channelsCount",
	"balanceUsd",
	"plan",
	"paidUntil",
	"banned",
] as const;
export type CustomersSort = (typeof CUSTOMER_SORTS)[number];

export const CustomersQuery = t.Composite([
	PageQuery,
	t.Object({
		/** Part of the email, any case. */
		q: t.Optional(t.String({ maxLength: 200 })),
		// `oneOf`, not `t.UnionEnum`: an optional UnionEnum fills in its first value.
		sort: t.Optional(oneOf(CUSTOMER_SORTS)),
		order: t.Optional(oneOf(["asc", "desc"])),
	}),
]);
export type CustomersQuery = Static<typeof CustomersQuery>;

export const CustomersPage = t.Object({
	items: t.Array(Customer),
	total: t.Number(),
});

export type Customer = Static<typeof Customer>;
export type CustomersPage = Static<typeof CustomersPage>;
