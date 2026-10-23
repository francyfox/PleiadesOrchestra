import type { Db } from "../database/database.ts";
import { expireStaleWaits } from "./waiting-runs.service.ts";

const EVERY_MS = 15_000;

/** Releases runs whose browser never answered, every 15 s. Returns the stop function. */
export function startWaitingRunsJob(
	db: Db,
	onError: (error: unknown) => void,
): () => void {
	const run = () => {
		try {
			expireStaleWaits(db, Date.now());
		} catch (error) {
			onError(error);
		}
	};
	const timer = setInterval(run, EVERY_MS);
	return () => clearInterval(timer);
}
