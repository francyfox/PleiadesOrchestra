import { auditMachine } from "$lib/system/audit";
import type { PageLoad } from "./$types";

/** Scores the snapshot the layout just loaded — a second probe would measure CPU load over a few milliseconds. */
export const load: PageLoad = async ({ parent }) => ({
	report: auditMachine((await parent()).system),
});
