// The sign-in forms: a signed-in account goes on to where it was going.
import { guard, guestOnly } from "#lib/guards.js";

export const load = guard(guestOnly);
