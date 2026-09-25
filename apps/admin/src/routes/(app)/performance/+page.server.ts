import { orError } from "$lib/server/admin-api";
import { services } from "$lib/server/services";
import type { PageServerLoad } from "./$types";

const DAY = 24 * 60 * 60 * 1000;

export const load: PageServerLoad = async () => {
	const { orchestrator } = services();
	return {
		report: await orError(
			orchestrator.performance({ from: Date.now() - 30 * DAY }),
		),
	};
};
