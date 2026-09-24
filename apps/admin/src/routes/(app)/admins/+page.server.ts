import { error, fail } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { banRefusal } from "$lib/admin-policy";
import { countActiveAdmins } from "$lib/server/db";
import { services } from "$lib/server/services";
import type { Actions, PageServerLoad } from "./$types";

const MIN_PASSWORD = 8;

function failFrom(cause: unknown) {
	if (cause instanceof APIError) {
		return fail(cause.statusCode >= 500 ? 500 : cause.statusCode, {
			message: cause.body?.message ?? cause.message,
		});
	}
	throw cause;
}

export const load: PageServerLoad = async ({ request }) => {
	const { users } = await services().auth.api.listUsers({
		query: { limit: 200, sortBy: "createdAt", sortDirection: "asc" },
		headers: request.headers,
	});
	return {
		admins: users.map((user) => ({
			id: user.id,
			name: user.name,
			email: user.email,
			banned: user.banned === true,
			banReason: user.banReason ?? null,
			createdAt: new Date(user.createdAt).getTime(),
		})),
	};
};

export const actions: Actions = {
	create: async ({ request }) => {
		const form = await request.formData();
		const email = String(form.get("email") ?? "").trim();
		const name = String(form.get("name") ?? "").trim() || email;
		const password = String(form.get("password") ?? "");
		if (!email || password.length < MIN_PASSWORD) {
			return fail(400, {
				message: `Почта обязательна, пароль — не короче ${MIN_PASSWORD} символов`,
			});
		}
		try {
			// Bypasses the closed public sign-up; requires an admin session.
			await services().auth.api.createUser({
				headers: request.headers,
				body: { email, name, password, role: "admin" },
			});
		} catch (cause) {
			return failFrom(cause);
		}
		return { created: email };
	},
	ban: async ({ request, locals }) => {
		if (!locals.user) error(401);
		const form = await request.formData();
		const userId = String(form.get("id") ?? "");
		const refusal = banRefusal({
			actorId: locals.user.id,
			targetId: userId,
			targetBanned: form.get("banned") === "true",
			activeAdmins: await countActiveAdmins(services().db),
		});
		if (refusal) return fail(400, { message: refusal });
		try {
			await services().auth.api.banUser({
				headers: request.headers,
				body: {
					userId,
					banReason: String(form.get("reason") ?? "").trim() || undefined,
				},
			});
		} catch (cause) {
			return failFrom(cause);
		}
		return { banned: userId };
	},
	unban: async ({ request }) => {
		const userId = String((await request.formData()).get("id") ?? "");
		try {
			await services().auth.api.unbanUser({
				headers: request.headers,
				body: { userId },
			});
		} catch (cause) {
			return failFrom(cause);
		}
		return { unbanned: userId };
	},
	setPassword: async ({ request }) => {
		const form = await request.formData();
		const userId = String(form.get("id") ?? "");
		const newPassword = String(form.get("password") ?? "");
		if (newPassword.length < MIN_PASSWORD) {
			return fail(400, {
				message: `Пароль — не короче ${MIN_PASSWORD} символов`,
			});
		}
		try {
			await services().auth.api.setUserPassword({
				headers: request.headers,
				body: { userId, newPassword },
			});
		} catch (cause) {
			return failFrom(cause);
		}
		return { passwordSet: userId };
	},
};
