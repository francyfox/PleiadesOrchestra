import { config } from "../config/config.service.ts";
import { db } from "../database/database.instance.ts";
import { runs } from "../run-binding/run-binding.instance.ts";
import { SqliteHistoryStore } from "./history.ts";

export const historyStore = new SqliteHistoryStore(
	db,
	config.MESSAGE_RETENTION_PER_USER,
	runs,
);
