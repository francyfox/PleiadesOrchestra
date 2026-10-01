import type { Db } from "../database/database.ts";
import {
	deleteInactiveAnonymousUsers,
	deleteStaleWorldState,
	scheduleHourly,
} from "./retention.service.ts";

export interface RetentionOptions {
	anonymousRetentionHours: number;
	worldStateRetentionHours: number;
	onError: (source: string) => (error: unknown) => void;
}

/** Starts the hourly cleanup jobs. Returns one function that stops them all. */
export function startRetentionJobs(db: Db, options: RetentionOptions) {
	const stops = [
		scheduleHourly(
			() =>
				deleteInactiveAnonymousUsers(
					db,
					Date.now(),
					options.anonymousRetentionHours,
				),
			options.onError("anonymous_cleanup_failed"),
		),
		scheduleHourly(
			() =>
				deleteStaleWorldState(db, Date.now(), options.worldStateRetentionHours),
			options.onError("world_state_cleanup_failed"),
		),
	];
	return () => {
		for (const stop of stops) stop();
	};
}
