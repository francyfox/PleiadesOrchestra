import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";
import { isStaff } from "../accounts/accounts.schema.ts";
import { tokenMatches } from "./staff-token.service.ts";

interface StaffRow {
	id: string;
	level: number;
	banned?: boolean | null;
	tokenHash?: string | null;
}

/**
 * Staff have no password: `POST /staff-token/sign-in {token}` creates a normal
 * better-auth session when the token's hash matches a staff account. Every
 * failure is the same `INVALID_TOKEN`, whatever the reason.
 */
export const staffToken = () =>
	({
		id: "staff-token",
		endpoints: {
			signInStaffToken: createAuthEndpoint(
				"/staff-token/sign-in",
				{ method: "POST", body: z.object({ token: z.string() }) },
				async (ctx) => {
					const staff = await ctx.context.adapter.findMany<StaffRow>({
						model: "user",
						where: [{ field: "level", operator: "lte", value: 100 }],
					});
					// Compare against every account, no early exit: timing says nothing about which matched.
					let found: StaffRow | undefined;
					for (const row of staff) {
						if (tokenMatches(ctx.body.token, row.tokenHash ?? null))
							found = row;
					}
					if (!found || !isStaff(found.level)) {
						throw new APIError("UNAUTHORIZED", { message: "INVALID_TOKEN" });
					}
					if (found.banned) {
						throw new APIError("FORBIDDEN", { message: "BANNED" });
					}
					const user = await ctx.context.internalAdapter.findUserById(found.id);
					const session = await ctx.context.internalAdapter.createSession(
						found.id,
					);
					if (!user || !session) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "SESSION_FAILED",
						});
					}
					await setSessionCookie(ctx, { session, user });
					return ctx.json({ ok: true });
				},
			),
		},
	}) satisfies BetterAuthPlugin;
