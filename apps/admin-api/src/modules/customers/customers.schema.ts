import { type Static, t } from "elysia";
import { PageQuery } from "../common/common.schema.ts";

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
});

export const CustomersQuery = PageQuery;

export const CustomersPage = t.Object({
	items: t.Array(Customer),
	total: t.Number(),
});

export type Customer = Static<typeof Customer>;
export type CustomersPage = Static<typeof CustomersPage>;
