import {
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { user } from "./database.auth-schema.ts";

/** Billing warning mails already sent: one row per account, kind and period, so each goes out once. */
export const accountNotices = sqliteTable(
	"account_notices",
	{
		accountId: text("account_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: text("kind", { enum: ["low_balance", "plan_ending"] }).notNull(),
		period: text("period").notNull(),
		sentAt: integer("sent_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.accountId, table.kind, table.period] }),
	],
);
