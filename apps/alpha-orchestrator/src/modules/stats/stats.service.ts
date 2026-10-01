import type { Db } from "../database/database.ts";
import { DAY_MS } from "../http/http.service.ts";
import { usageSinceEach } from "../usage/usage.service.ts";
import type { UsageTotals } from "../usage/usage.types.ts";
import { STATUS_SQL } from "../users/users.sql.ts";

interface UserCounts {
	total: number;
	pending: number;
	blocked: number;
	anonymous: number;
}

function userCounts(db: Db): UserCounts {
	const counts = db.$client
		.query<UserCounts, []>(
			`SELECT COUNT(*) AS total,
				COALESCE(SUM(CASE WHEN ${STATUS_SQL} = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
				COALESCE(SUM(CASE WHEN ${STATUS_SQL} = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked,
				COALESCE(SUM(CASE WHEN u.kind = 'anonymous' THEN 1 ELSE 0 END), 0) AS anonymous
			FROM users u JOIN channels c ON c.id = u.channel_id`,
		)
		.get();
	return counts ?? { total: 0, pending: 0, blocked: 0, anonymous: 0 };
}

export function stats(db: Db, now: number) {
	const startOfDay = now - (now % DAY_MS);
	const [today, last7d, last30d] = usageSinceEach(db, [
		startOfDay,
		now - 7 * DAY_MS,
		now - 30 * DAY_MS,
	]) as [UsageTotals, UsageTotals, UsageTotals];
	return { users: userCounts(db), usage: { today, last7d, last30d } };
}
