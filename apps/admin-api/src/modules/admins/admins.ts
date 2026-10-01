import { APIError } from "better-auth/api";
import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import {
	banRefusal,
	deleteRefusal,
	MIN_PASSWORD,
	passwordRefusal,
} from "../admin-policy/admin-policy.service.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { ApiError } from "../common/common.schema.ts";
import {
	AdminsPage,
	AdminsQuery,
	BanInput,
	CreateAdminInput,
	SetPasswordInput,
} from "./admins.schema.ts";
import {
	countActiveAdmins,
	fetchAdminsPage,
	findAdmin,
} from "./admins.service.ts";

const Params = t.Object({ id: t.String() });
const Ok = t.Object({ id: t.String() });

/** Policy refusals that are about who you are (403) vs. what would break the panel (400). */
const refusalStatus = (code: string) =>
	code === "not_super" || code === "super_protected" ? 403 : 400;

/** Admin accounts (better-auth's admin plugin). Every route needs an admin session. */
export function adminsRoutes({ auth, db, admins }: RouteDeps) {
	/** better-auth failures keep their own message; 5xx collapse to 500. */
	const fromAuthError = (cause: unknown) => {
		if (cause instanceof APIError) {
			return {
				code: (cause.statusCode >= 500 ? 500 : cause.statusCode) as
					| 400
					| 401
					| 403
					| 500,
				body: { message: cause.body?.message ?? cause.message },
			};
		}
		throw cause;
	};

	return new Elysia({
		name: "admin-api.admins",
		prefix: "/admins",
		tags: ["admins"],
	})
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.get("/", ({ query }) => fetchAdminsPage({ db, admins }, query), {
					query: AdminsQuery,
					response: AdminsPage,
					detail: {
						summary: "List admin accounts",
						description:
							"Oldest first (the super admin leads). `pageSize` omitted → every account; `total` always counts all of them.",
					},
				})
				.post(
					"/",
					async ({ body, request, status }) => {
						const email = body.email.trim();
						if (!email || body.password.length < MIN_PASSWORD) {
							return status(400, {
								error: "weak_credentials",
								min: MIN_PASSWORD,
							});
						}
						try {
							// Bypasses the closed public sign-up; requires an admin session.
							const { user } = await auth.api.createUser({
								headers: request.headers,
								body: {
									email,
									name: body.name?.trim() || email,
									password: body.password,
									role: "admin",
								},
							});
							return { id: user.id };
						} catch (cause) {
							const { code, body: error } = fromAuthError(cause);
							return status(code, error);
						}
					},
					{
						body: CreateAdminInput,
						response: {
							200: Ok,
							400: ApiError,
							401: ApiError,
							403: ApiError,
							500: ApiError,
						},
						detail: { summary: "Create an admin account" },
					},
				)
				.post(
					"/:id/ban",
					async ({ params, body, admin, request, status }) => {
						const target = await findAdmin(db, params.id);
						if (!target) return status(404, { error: "not_found" });
						const refusal = banRefusal({
							actorId: admin.id,
							targetId: params.id,
							targetBanned: target.banned === true,
							activeAdmins: await countActiveAdmins(db),
							superId: (await admins.superId()) ?? undefined,
						});
						if (refusal) {
							return status(refusalStatus(refusal), { error: refusal });
						}
						try {
							await auth.api.banUser({
								headers: request.headers,
								body: {
									userId: params.id,
									banReason: body?.reason?.trim() || undefined,
								},
							});
							return { id: params.id };
						} catch (cause) {
							const { code, body: error } = fromAuthError(cause);
							return status(code, error);
						}
					},
					{
						params: Params,
						body: t.Optional(BanInput),
						response: {
							200: Ok,
							400: ApiError,
							401: ApiError,
							403: ApiError,
							404: ApiError,
							500: ApiError,
						},
						detail: {
							summary: "Ban an admin",
							description:
								"Refused with `self` (own account, 400), `last_admin` (would leave no active admin, 400) or `super_protected` (the super admin, 403).",
						},
					},
				)
				.post(
					"/:id/unban",
					async ({ params, request, status }) => {
						try {
							await auth.api.unbanUser({
								headers: request.headers,
								body: { userId: params.id },
							});
							return { id: params.id };
						} catch (cause) {
							const { code, body: error } = fromAuthError(cause);
							return status(code, error);
						}
					},
					{
						params: Params,
						response: {
							200: Ok,
							400: ApiError,
							401: ApiError,
							403: ApiError,
							500: ApiError,
						},
						detail: { summary: "Unban an admin" },
					},
				)
				.post(
					"/:id/password",
					async ({ params, body, admin, request, status }) => {
						if (body.password.length < MIN_PASSWORD) {
							return status(400, { error: "weak_password", min: MIN_PASSWORD });
						}
						const superId = await admins.superId();
						const refusal =
							superId &&
							passwordRefusal({
								actorId: admin.id,
								targetId: params.id,
								superId,
							});
						if (refusal) return status(403, { error: refusal });
						try {
							await auth.api.setUserPassword({
								headers: request.headers,
								body: { userId: params.id, newPassword: body.password },
							});
							return { id: params.id };
						} catch (cause) {
							const { code, body: error } = fromAuthError(cause);
							return status(code, error);
						}
					},
					{
						params: Params,
						body: SetPasswordInput,
						response: {
							200: Ok,
							400: ApiError,
							401: ApiError,
							403: ApiError,
							500: ApiError,
						},
						detail: {
							summary: "Set an admin's password",
							description:
								"The super admin's password can only be changed by the super admin (`super_protected`, 403).",
						},
					},
				)
				.delete(
					"/:id",
					async ({ params, admin, request, status }) => {
						const target = await findAdmin(db, params.id);
						if (!target) return status(404, { error: "not_found" });
						const superId = await admins.superId();
						const refusal = superId
							? deleteRefusal({
									actorId: admin.id,
									targetId: params.id,
									superId,
								})
							: null;
						if (refusal) {
							return status(refusalStatus(refusal), { error: refusal });
						}
						try {
							await auth.api.removeUser({
								headers: request.headers,
								body: { userId: params.id },
							});
							return { id: params.id };
						} catch (cause) {
							const { code, body: error } = fromAuthError(cause);
							return status(code, error);
						}
					},
					{
						params: Params,
						response: {
							200: Ok,
							400: ApiError,
							401: ApiError,
							403: ApiError,
							404: ApiError,
							500: ApiError,
						},
						detail: {
							summary: "Delete an admin account",
							description:
								"Super admin only (`not_super`, 403), never their own account (`self`, 400).",
						},
					},
				),
		);
}
