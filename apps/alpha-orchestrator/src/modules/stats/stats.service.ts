import type { Db } from "../database/database.ts";
import { DAY_MS } from "../http/http.service.ts";
import { usageSinceEach } from "../usage/usage.service.ts";
import type { UsageTotals } from "../usage/usage.types.ts";
import { STATUS_SQL } from "../visitors/visitors.sql.ts";

interface VisitorCounts {
	total: number;
	pending: number;
	blocked: number;
	anonymous: number;
}

function visitorCounts(db: Db, ownerId?: string): VisitorCounts {
	const counts = db.$client
		.query<VisitorCounts, Record<string, string>>(
			`SELECT COUNT(*) AS total,
				COALESCE(SUM(CASE WHEN ${STATUS_SQL} = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
				COALESCE(SUM(CASE WHEN ${STATUS_SQL} = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked,
				COALESCE(SUM(CASE WHEN u.kind = 'anonymous' THEN 1 ELSE 0 END), 0) AS anonymous
			FROM visitors u JOIN channels c ON c.id = u.channel_id
			${ownerId ? "WHERE c.owner_id = $ownerId" : ""}`,
		)
		.get(ownerId ? { ownerId } : {});
	return counts ?? { total: 0, pending: 0, blocked: 0, anonymous: 0 };
}

/** `ownerId` counts only the channels of that admin-api account. */
export function stats(db: Db, now: number, ownerId?: string) {
	const startOfDay = now - (now % DAY_MS);
	const [today, last7d, last30d] = usageSinceEach(
		db,
		[startOfDay, now - 7 * DAY_MS, now - 30 * DAY_MS],
		ownerId,
	) as [UsageTotals, UsageTotals, UsageTotals];
	return {
		visitors: visitorCounts(db, ownerId),
		usage: { today, last7d, last30d },
	};
}
