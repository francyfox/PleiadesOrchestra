// Everything else of the panel: staff only.
import { guard, staffOnly } from "#lib/guards.js";

export const load = guard(staffOnly);
