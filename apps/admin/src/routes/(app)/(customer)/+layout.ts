// Billing and own settings: customers only.
import { customerOnly, guard, signedIn } from "#lib/guards.js";

export const load = guard(signedIn, customerOnly);
