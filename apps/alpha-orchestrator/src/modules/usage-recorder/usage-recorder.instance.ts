import { db } from "../database/database.instance.ts";
import { runs } from "../run-binding/run-binding.instance.ts";
import { SqliteUsageRecorder } from "./usage-recorder.ts";

export const usageRecorder = new SqliteUsageRecorder(db, runs);
