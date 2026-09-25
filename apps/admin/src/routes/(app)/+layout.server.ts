import { systemSnapshot } from "$lib/server/system/snapshot";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => ({
	system: await systemSnapshot(),
	admin: locals.user
		? { id: locals.user.id, name: locals.user.name, email: locals.user.email }
		: null,
});
