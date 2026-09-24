import { fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { services } from "$lib/server/services";
import type { Actions } from "./$types";

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const email = String(form.get("email") ?? "").trim();
		const password = String(form.get("password") ?? "");
		if (!email || !password) {
			return fail(400, { email, message: "Укажите почту и пароль" });
		}
		try {
			// sveltekitCookies sets the session cookie on this response.
			await services().auth.api.signInEmail({
				body: { email, password },
				headers: request.headers,
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { email, message: "Неверная почта или пароль" });
			}
			throw error;
		}
		redirect(303, "/");
	},
};
