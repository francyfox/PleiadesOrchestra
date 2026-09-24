import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../env.ts";
import { DEFAULT_MIGRATIONS_DIR, openDatabase } from "./client.ts";
import { SqliteHistoryStore } from "./history-store.ts";
import { ChannelDirectory } from "./identity.ts";
import { RunBinding } from "./run-binding.ts";
import { SqliteUsageRecorder } from "./usage-recorder.ts";

// Runtime singletons — only imported by runtime code (index.ts/agent.ts),
// never by tests, which build their own in-memory database.
if (config.DATABASE_PATH !== ":memory:") {
	mkdirSync(dirname(config.DATABASE_PATH), { recursive: true });
}

export const db = openDatabase(
	config.DATABASE_PATH,
	config.DATABASE_MIGRATIONS_DIR ?? DEFAULT_MIGRATIONS_DIR,
);
export const runs = new RunBinding();
export const channels = new ChannelDirectory(db);
export const usageRecorder = new SqliteUsageRecorder(db, runs);
export const historyStore = new SqliteHistoryStore(
	db,
	config.MESSAGE_RETENTION_PER_USER,
	runs,
);
