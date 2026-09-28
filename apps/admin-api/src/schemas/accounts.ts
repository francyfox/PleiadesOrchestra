import { createSelectSchema } from "drizzle-typebox";
import { type Static, t } from "elysia";
import { user } from "../db/auth-schema.ts";

/** The `user` table (better-auth) as a TypeBox schema, derived from the Drizzle definition. */
const UserRow = createSelectSchema(user);

/** The signed-in admin, as the panel needs to know them. */
export const AdminSelf = t.Composite([
	t.Pick(UserRow, ["id", "name", "email"]),
	/** The first account: the only one that may delete admins. */
	t.Object({ isSuper: t.Boolean() }),
]);

/** One row of the /admins table. Timestamps are epoch ms, like every other DTO. */
export const AdminAccount = t.Composite([
	t.Pick(UserRow, ["id", "name", "email", "banReason"]),
	t.Object({
		banned: t.Boolean(),
		createdAt: t.Number(),
		isSuper: t.Boolean(),
	}),
]);

/** Optional paging of `GET /admins`; without `pageSize` every account comes back. */
export const AdminsQuery = t.Object({
	page: t.Optional(t.Numeric({ minimum: 1 })),
	pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
});

export const AdminsPage = t.Object({
	admins: t.Array(AdminAccount),
	total: t.Number(),
});

export const Credentials = t.Object({
	email: t.String(),
	password: t.String(),
});

export const Registration = t.Composite([
	Credentials,
	t.Object({ name: t.Optional(t.String()) }),
]);

export const CreateAdminInput = t.Composite([
	Credentials,
	t.Object({ name: t.Optional(t.String()) }),
]);

export const BanInput = t.Object({ reason: t.Optional(t.String()) });
export const SetPasswordInput = t.Object({ password: t.String() });

export const Session = t.Object({
	/** No admin account exists yet: only /register is reachable. */
	setupRequired: t.Boolean(),
	admin: t.Union([AdminSelf, t.Null()]),
});

export type AdminSelf = Static<typeof AdminSelf>;
export type AdminAccount = Static<typeof AdminAccount>;
export type Session = Static<typeof Session>;
export type AdminsPage = Static<typeof AdminsPage>;
