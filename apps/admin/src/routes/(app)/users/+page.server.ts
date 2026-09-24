import { fail } from "@sveltejs/kit";
import type { BulkAction } from "$lib/api-types";
import { orchestratorAs, orError, orFail } from "$lib/server/admin-api";
import { services } from "$lib/server/services";
import { parseUsersState, toUsersQuery } from "$lib/users-table-state";
import type { Actions, PageServerLoad } from "./$types";

const BULK_ACTIONS: readonly BulkAction[] = [
	"whitelist",
	"unwhitelist",
	"block",
	"unblock",
];

export const load: PageServerLoad = async ({ url }) => {
	const state = parseUsersState(url.searchParams);
	const { orchestrator } = services();
	const [page, channels] = await orError(
		Promise.all([
			orchestrator.listUsers(toUsersQuery(state)),
			orchestrator.listChannels(),
		]),
	);
	return { state, page, channels: channels.items };
};

export const actions: Actions = {
	bulk: async ({ request, locals }) => {
		const form = await request.formData();
		const ids = form.getAll("ids").map(String).filter(Boolean);
		const action = BULK_ACTIONS.find(
			(candidate) => candidate === form.get("action"),
		);
		const reason = String(form.get("reason") ?? "").trim() || undefined;
		if (!action || ids.length === 0) {
			return fail(400, { message: "Выберите пользователей и действие" });
		}
		const result = await orFail(
			orchestratorAs(locals).bulkUsers(ids, action, reason),
		);
		if (!result || "status" in result) return result;
		return { updated: result.updated, action };
	},
};
