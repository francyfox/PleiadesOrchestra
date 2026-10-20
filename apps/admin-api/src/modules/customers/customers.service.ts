import { and, asc, count, eq } from "drizzle-orm";
import { LEVEL } from "../accounts/accounts.schema.ts";
import type { PageQuery } from "../common/common.schema.ts";
import { type AdminDb, schema } from "../database/database.ts";
import type { OrchestratorClient } from "../orchestrator/orchestrator.ts";
import type { CustomersPage } from "./customers.schema.ts";

const customers = eq(schema.user.level, LEVEL.user);

export async function findCustomer(db: AdminDb, id: string) {
	const [row] = await db
		.select()
		.from(schema.user)
		.where(and(eq(schema.user.id, id), customers));
	return row ?? null;
}

/**
 * `GET /api/accounts`: level-200 accounts, oldest first, with how many channels
 * each owns. shortcut: counts come from one unpaged channel list, grouped here;
 * ask the orchestrator for counts per owner when the channel list gets long.
 */
export async function fetchCustomersPage(
	{ db, orchestrator }: { db: AdminDb; orchestrator: OrchestratorClient },
	query: PageQuery,
): Promise<CustomersPage> {
	const ordered = db
		.select()
		.from(schema.user)
		.where(customers)
		.orderBy(asc(schema.user.createdAt), asc(schema.user.id));
	const [rows, { items: channels }, [total]] = await Promise.all([
		query.pageSize
			? ordered
					.limit(query.pageSize)
					.offset(((query.page ?? 1) - 1) * query.pageSize)
			: ordered,
		orchestrator.listChannels(),
		db.select({ value: count() }).from(schema.user).where(customers),
	]);
	const owned = new Map<string, number>();
	for (const { ownerId } of channels) {
		if (ownerId) owned.set(ownerId, (owned.get(ownerId) ?? 0) + 1);
	}
	return {
		items: rows.map((user) => ({
			id: user.id,
			name: user.name,
			email: user.email,
			emailVerified: user.emailVerified,
			createdAt: user.createdAt.getTime(),
			lastActiveAt: user.lastActiveAt?.getTime() ?? null,
			banned: user.banned === true,
			channelsCount: owned.get(user.id) ?? 0,
		})),
		total: total?.value ?? 0,
	};
}
