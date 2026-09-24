import { fail } from "@sveltejs/kit";
import { orchestratorAs, orError, orFail } from "$lib/server/admin-api";
import { services } from "$lib/server/services";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const { orchestrator } = services();
	const [blocked, channels] = await orError(
		Promise.all([orchestrator.listBlockedIps(), orchestrator.listChannels()]),
	);
	return { items: blocked.items, channels: channels.items };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const ip = String(form.get("ip") ?? "").trim();
		const reason = String(form.get("reason") ?? "").trim();
		const expiresInHours = Number(form.get("expiresInHours"));
		const channelId = String(form.get("channelId") ?? "") || undefined;
		if (
			!ip ||
			!reason ||
			!Number.isFinite(expiresInHours) ||
			expiresInHours <= 0
		) {
			return fail(400, {
				message: "IP, причина и срок (часы > 0) обязательны",
			});
		}
		const result = await orFail(
			orchestratorAs(locals).createBlockedIp({
				ip,
				reason,
				expiresInHours,
				channelId,
			}),
		);
		return "status" in result ? result : { created: true };
	},
	delete: async ({ request, locals }) => {
		const id = String((await request.formData()).get("id") ?? "");
		const result = await orFail(orchestratorAs(locals).deleteBlockedIp(id));
		return result ?? { deleted: true };
	},
};
