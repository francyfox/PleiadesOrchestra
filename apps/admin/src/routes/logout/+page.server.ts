import { redirect } from "@sveltejs/kit";
import { services } from "$lib/server/services";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = () => redirect(303, "/");

export const actions: Actions = {
	default: async ({ request }) => {
		await services().auth.api.signOut({ headers: request.headers });
		redirect(303, "/login");
	},
};
