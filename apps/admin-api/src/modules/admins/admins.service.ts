import { and, asc, count, eq, isNull, lte, or } from "drizzle-orm";
import { LEVEL } from "../accounts/accounts.schema.ts";
import type { Auth } from "../auth/auth.ts";
import type { FetchContext } from "../common/common.types.ts";
import { type AdminDb, schema } from "../database/database.ts";
import {
	generateToken,
	hashToken,
} from "../staff-token/staff-token.service.ts";
import type { AdminsPage } from "./admins.schema.ts";

/** Page parameters of `GET /admins`; no `pageSize` means every account. */
export interface PageParams {
	page?: number;
	pageSize?: number;
}

/** A refusal the route turns into an error code. */
export class AccountError extends Error {
	constructor(readonly code: "email_taken") {
		super(code);
	}
}

const staff = lte(schema.user.level, LEVEL.admin);

/** Staff accounts (the panel's "admins"); users are not counted. */
export async function countAdmins(db: AdminDb): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(schema.user)
		.where(staff);
	return row?.value ?? 0;
}

export async function countActiveAdmins(db: AdminDb): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(schema.user)
		.where(
			and(staff, or(isNull(schema.user.banned), eq(schema.user.banned, false))),
		);
	return row?.value ?? 0;
}

export async function findAdmin(db: AdminDb, id: string) {
	const [row] = await db
		.select()
		.from(schema.user)
		.where(and(eq(schema.user.id, id), staff));
	return row ?? null;
}

/**
 * Whether a staff account exists, remembered once true (the session endpoint
 * is hit on every panel navigation). False means a fresh install: run `admin:create`.
 */
export function createAdminDirectory(db: AdminDb) {
	let adminExists = false;
	return {
		async hasAdmin(): Promise<boolean> {
			if (!adminExists) adminExists = (await countAdmins(db)) > 0;
			return adminExists;
		},
	};
}

export type AdminDirectory = ReturnType<typeof createAdminDirectory>;

/** `GET /api/admins`: oldest first (a super admin leads); `pageSize` omitted → every account. */
export async function fetchAdminsPage(
	{ db }: Pick<FetchContext, "db">,
	query: PageParams,
): Promise<AdminsPage> {
	const ordered = db
		.select()
		.from(schema.user)
		.where(staff)
		.orderBy(asc(schema.user.createdAt), asc(schema.user.id));
	const rows = query.pageSize
		? await ordered
				.limit(query.pageSize)
				.offset(((query.page ?? 1) - 1) * query.pageSize)
		: await ordered;
	return {
		admins: rows.map((user) => ({
			id: user.id,
			name: user.name,
			email: user.email,
			banned: user.banned === true,
			banReason: user.banReason ?? null,
			createdAt: user.createdAt.getTime(),
			level: user.level,
			isSuper: user.level === LEVEL.super,
		})),
		total: await countAdmins(db),
	};
}

/** Creates a staff account (no password, e-mail is contact data) and returns its one-time token. */
export async function createStaff(
	auth: Auth,
	input: { name: string; email: string; level: 0 | 100 },
): Promise<{ id: string; email: string; token: string }> {
	const { internalAdapter } = await auth.$context;
	const email = input.email.trim().toLowerCase();
	if (await internalAdapter.findUserByEmail(email)) {
		throw new AccountError("email_taken");
	}
	const token = generateToken();
	const user = await internalAdapter.createUser(
		{
			name: input.name.trim() || email,
			email,
			emailVerified: true,
			level: input.level,
			tokenHash: hashToken(token),
		},
		{ method: "admin" },
	);
	return { id: user.id, email, token };
}

/** New token for a staff account; the old one stops and the account's sessions are dropped. */
export async function rotateToken(auth: Auth, id: string): Promise<string> {
	const { internalAdapter } = await auth.$context;
	const token = generateToken();
	await internalAdapter.updateUser(id, { tokenHash: hashToken(token) });
	await internalAdapter.deleteUserSessions(id);
	return token;
}

/** Name and e-mail of a staff account; an e-mail another account holds is `email_taken`. */
export async function editStaff(
	auth: Auth,
	id: string,
	input: { name: string; email: string },
) {
	const { internalAdapter } = await auth.$context;
	const email = input.email.trim().toLowerCase();
	const holder = await internalAdapter.findUserByEmail(email);
	if (holder && holder.user.id !== id) throw new AccountError("email_taken");
	await internalAdapter.updateUser(id, {
		name: input.name.trim() || email,
		email,
	});
}
