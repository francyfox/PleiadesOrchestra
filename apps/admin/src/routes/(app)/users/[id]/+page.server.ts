import { orchestratorAs, orError, orFail } from "$lib/server/admin-api";
import { services } from "$lib/server/services";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => ({
	details: await orError(services().orchestrator.getUser(params.id)),
});

export const actions: Actions = {
	whitelist: ({ params, locals }) =>
		orFail(orchestratorAs(locals).whitelistUser(params.id)),
	unwhitelist: ({ params, locals }) =>
		orFail(orchestratorAs(locals).unwhitelistUser(params.id)),
	block: async ({ params, locals, request }) => {
		const reason = String(
			(await request.formData()).get("reason") ?? "",
		).trim();
		return orFail(
			orchestratorAs(locals).blockUser(params.id, reason || undefined),
		);
	},
	unblock: ({ params, locals }) =>
		orFail(orchestratorAs(locals).unblockUser(params.id)),
	deleteMessages: async ({ params, locals }) => {
		const result = await orFail(
			orchestratorAs(locals).deleteUserMessages(params.id),
		);
		return result ?? { deleted: true };
	},
};
