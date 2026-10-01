import { type Static, t } from "elysia";
import { AdminSelf, Credentials } from "../admins/admins.schema.ts";

export const Registration = t.Composite([
	Credentials,
	t.Object({ name: t.Optional(t.String()) }),
]);

export const Session = t.Object({
	/** No admin account exists yet: only /register is reachable. */
	setupRequired: t.Boolean(),
	admin: t.Union([AdminSelf, t.Null()]),
});

export type Session = Static<typeof Session>;
