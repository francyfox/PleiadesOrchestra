/**
 * One-off: moves the old `ALLOWED_TELEGRAM_USER_IDS` whitelist (apps/telegram-bot's
 * env) into the orchestrator database, where the admin panel manages it.
 *
 *   bun run import:telegram-whitelist 123,456
 *   ALLOWED_TELEGRAM_USER_IDS=123,456 bun run import:telegram-whitelist
 *
 * Only needs DATABASE_PATH (and DATABASE_MIGRATIONS_DIR outside the repo) —
 * deliberately not the full service config.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_MIGRATIONS_DIR, openDatabase } from "../src/db/client.ts";
import {
	importTelegramWhitelist,
	parseIds,
} from "../src/db/whitelist-import.ts";

const raw = process.argv[2] ?? process.env.ALLOWED_TELEGRAM_USER_IDS;
if (!raw) {
	console.error(
		"Usage: bun run import:telegram-whitelist <id,id,...> (or set ALLOWED_TELEGRAM_USER_IDS)",
	);
	process.exit(1);
}

const path = process.env.DATABASE_PATH ?? "./data/orchestrator.db";
mkdirSync(dirname(path), { recursive: true });
const db = openDatabase(
	path,
	process.env.DATABASE_MIGRATIONS_DIR ?? DEFAULT_MIGRATIONS_DIR,
);
const count = importTelegramWhitelist(db, parseIds(raw), Date.now());
db.$client.close();
console.log(`Whitelisted ${count} Telegram user(s) in ${path}`);
