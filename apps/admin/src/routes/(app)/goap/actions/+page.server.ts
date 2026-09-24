import { orError } from "$lib/server/admin-api";
import { services } from "$lib/server/services";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => ({
	actions: (await orError(services().orchestrator.goapActions())).actions,
});
