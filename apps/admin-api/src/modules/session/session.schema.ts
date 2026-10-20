import { type Static, t } from "elysia";
import { AdminSelf } from "../admins/admins.schema.ts";

export const TokenLogin = t.Object({ token: t.String() });

export const Session = t.Object({
	/** No staff account exists yet: create one with `admin:create`. */
	setupRequired: t.Boolean(),
	/** The signed-in account: staff or user, told apart by `level`. */
	admin: t.Union([AdminSelf, t.Null()]),
});

export type Session = Static<typeof Session>;
