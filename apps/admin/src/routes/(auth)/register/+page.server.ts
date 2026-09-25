import { fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { services } from "$lib/server/services";
import type { Actions } from "./$types";

const MIN_PASSWORD = 8;

export const actions: Actions = {
	// Only reachable while no admin exists (hooks.server.ts); the API itself
	// also rejects sign-ups after that (auth.ts), so this is not the only guard.
	default: async ({ request }) => {
		const form = await request.formData();
		const name = String(form.get("name") ?? "").trim();
		const email = String(form.get("email") ?? "").trim();
		const password = String(form.get("password") ?? "");
		if (!email || password.length < MIN_PASSWORD) {
			return fail(400, {
				name,
				email,
				error: "weak_credentials" as const,
				min: MIN_PASSWORD,
			});
		}
		try {
			await services().auth.api.signUpEmail({
				body: { name: name || email, email, password },
				headers: request.headers,
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(error.statusCode === 403 ? 403 : 400, {
					name,
					email,
					// Localized on the client; better-auth's own text kept as detail.
					error:
						error.statusCode === 403
							? ("registration_closed" as const)
							: ("signup_failed" as const),
					detail: error.statusCode === 403 ? undefined : error.body?.message,
				});
			}
			throw error;
		}
		redirect(303, "/");
	},
};
