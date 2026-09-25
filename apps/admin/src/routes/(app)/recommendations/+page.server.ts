import { systemSnapshot } from "$lib/server/system/snapshot";
import { auditMachine } from "$lib/system/audit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => ({
	report: auditMachine(await systemSnapshot()),
});
