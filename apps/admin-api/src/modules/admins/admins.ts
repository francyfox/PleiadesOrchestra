import { APIError } from "better-auth/api";
import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { LEVEL } from "../accounts/accounts.schema.ts";
import {
	banRefusal,
	deleteRefusal,
	isEmail,
	manageRefusal,
} from "../admin-policy/admin-policy.service.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { ApiError } from "../common/common.schema.ts";
import {
	AdminsPage,
	AdminsQuery,
	AdminToken,
	BanInput,
	CreateAdminInput,
	EditAdminInput,
} from "./admins.schema.ts";
import {
	AccountError,
	countActiveAdmins,
	createStaff,
	editStaff,
	fetchAdminsPage,
	findAdmin,
	rotateToken,
} from "./admins.service.ts";

const Params = t.Object({ id: t.String() });
const Ok = t.Object({ id: t.String() });

/** Policy refusals that are about who you are (403) vs. what would break the panel (400). */
const refusalStatus = (code: string) =>
	code === "not_super" || code === "super_protected" ? 403 : 400;

/** Admin accounts (better-auth's admin plugin). Every route needs an admin session. */
export function adminsRoutes({ auth, db }: RouteDeps) {
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
				.get("/", ({ query }) => fetchAdminsPage({ db }, query), {
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
					async ({ body, admin, status }) => {
						if (admin.level !== LEVEL.super) {
							return status(403, { error: "not_super" });
						}
						if (!isEmail(body.email.trim())) {
							return status(400, { error: "invalid_email" });
						}
						try {
							return await createStaff(auth, { ...body, level: LEVEL.admin });
						} catch (cause) {
							if (cause instanceof AccountError) {
								return status(409, { error: cause.code });
							}
							throw cause;
						}
					},
					{
						body: CreateAdminInput,
						response: {
							200: AdminToken,
							400: ApiError,
							401: ApiError,
							403: ApiError,
							409: ApiError,
						},
						detail: {
							summary: "Create an admin account",
							description:
								"Super admin only (`not_super`, 403). Returns the access token once; only its hash is stored. Staff have no password.",
						},
					},
				)
				.patch(
					"/:id",
					async ({ params, body, admin, status }) => {
						const refusal = manageRefusal({
							actorId: admin.id,
							actorLevel: admin.level,
							targetId: params.id,
						});
						if (refusal) return status(403, { error: refusal });
						if (!(await findAdmin(db, params.id))) {
							return status(404, { error: "not_found" });
						}
						if (!isEmail(body.email.trim())) {
							return status(400, { error: "invalid_email" });
						}
						try {
							await editStaff(auth, params.id, body);
							return { id: params.id };
						} catch (cause) {
							if (cause instanceof AccountError) {
								return status(409, { error: cause.code });
							}
							throw cause;
						}
					},
					{
						params: Params,
						body: EditAdminInput,
						response: {
							200: Ok,
							400: ApiError,
							401: ApiError,
							403: ApiError,
							404: ApiError,
							409: ApiError,
						},
						detail: {
							summary: "Edit an admin's name and email",
							description:
								"Your own account, or anyone's as a super admin (`not_super`, 403). Email is contact data, not a login.",
						},
					},
				)
				.post(
					"/:id/token",
					async ({ params, admin, status }) => {
						const refusal = manageRefusal({
							actorId: admin.id,
							actorLevel: admin.level,
							targetId: params.id,
						});
						if (refusal) return status(403, { error: refusal });
						const target = await findAdmin(db, params.id);
						if (!target) return status(404, { error: "not_found" });
						return {
							id: params.id,
							email: target.email,
							token: await rotateToken(auth, params.id),
						};
					},
					{
						params: Params,
						response: {
							200: AdminToken,
							401: ApiError,
							403: ApiError,
							404: ApiError,
						},
						detail: {
							summary: "Rotate an admin's access token",
							description:
								"Your own token, or anyone's as a super admin. The old token stops at once and every session of that account is dropped (yours too, when rotating your own). The new token is shown once.",
						},
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
							targetIsSuper: target.level === LEVEL.super,
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
				.delete(
					"/:id",
					async ({ params, admin, request, status }) => {
						const target = await findAdmin(db, params.id);
						if (!target) return status(404, { error: "not_found" });
						const refusal = deleteRefusal({
							actorId: admin.id,
							actorLevel: admin.level,
							targetId: params.id,
						});
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
