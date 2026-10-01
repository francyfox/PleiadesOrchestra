import type { AdminDirectory } from "../admins/admins.service.ts";
import type { AdminDb } from "../database/database.ts";
import type { OrchestratorClient } from "../orchestrator/orchestrator.ts";

/** Everything the data behind an admin page is read from. */
export interface FetchContext {
	orchestrator: OrchestratorClient;
	db: AdminDb;
	/** Remembered facts about the admin accounts (first-run state, who the super admin is). */
	admins: AdminDirectory;
	now: () => number;
}
