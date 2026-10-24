import { desc, eq, sql } from "drizzle-orm";
import { planRuns } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import {
	AWAITED_ARGS_FACT,
	AWAITED_TOOL_FACT,
	EXPIRED_FACT,
} from "../run-stream/run-stream.service.ts";
import { sessionFacts } from "../run-stream/run-stream.ts";
import { readQueue } from "../tasks/tasks.service.ts";
import { SqliteWorldStateStore } from "../world-state/world-state.ts";
import type { Pending } from "./pending.types.ts";

/** Checkpoint fact: the interrupted run `pending` already told the widget about. */
const INTERRUPTED_SEEN_FACT = "interruptedSeen";

function parse(json: unknown): Record<string, unknown> {
	try {
		const value: unknown = JSON.parse(String(json));
		return value !== null && typeof value === "object"
			? (value as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

/**
 * What the server still holds for this thread, for a widget that reloaded or
 * lost its connection (it never replays anything by itself): a call the browser
 * owes, a run the server lost, or a wait that timed out (told once).
 */
export async function pendingOf(db: Db, threadId: string): Promise<Pending> {
	const store = new SqliteWorldStateStore(db);
	const checkpoint = await store.load(threadId);
	const state = checkpoint?.state ?? {};
	const latest = db
		.select({
			id: planRuns.id,
			root: planRuns.rootRunId,
			interrupted: planRuns.interrupted,
		})
		.from(planRuns)
		.where(eq(planRuns.threadId, threadId))
		.orderBy(desc(planRuns.createdAt), sql`rowid desc`)
		.get();
	// The checkpoint waits for the call of the thread's newest run; an older one
	// was answered already (the run after it is the newest).
	const tool = state[AWAITED_TOOL_FACT];
	if (latest && typeof tool === "string" && state.planRunId === latest.id) {
		return {
			state: "waiting",
			callId: latest.id,
			tool,
			arguments: parse(state[AWAITED_ARGS_FACT]),
			tasksLeft: readQueue(state).length,
		};
	}
	if (state[EXPIRED_FACT] !== undefined) {
		const expired = parse(state[EXPIRED_FACT]);
		const kept = sessionFacts(state);
		if (Object.keys(kept).length > 0)
			await store.save(threadId, { state: kept, goal: {} });
		else await store.clear(threadId);
		return {
			state: "expired",
			prompt: String(expired.prompt ?? ""),
			tasksLeft: Number(expired.tasksLeft ?? 0),
		};
	}
	if (latest?.interrupted && state[INTERRUPTED_SEEN_FACT] !== latest.id) {
		const root = db
			.select({ prompt: planRuns.prompt })
			.from(planRuns)
			.where(eq(planRuns.id, latest.root ?? latest.id))
			.get();
		// Told once: remembered in the thread's facts (a newer run replaces them).
		await store.save(threadId, {
			state: { ...state, [INTERRUPTED_SEEN_FACT]: latest.id },
			goal: checkpoint?.goal ?? {},
		});
		return {
			state: "interrupted",
			runId: latest.id,
			prompt: root?.prompt ?? "",
			// shortcut: the checkpoint of the last wait, not of the lost run; close enough for a notice.
			tasksLeft: readQueue(state).length,
		};
	}
	return { state: "none" };
}
