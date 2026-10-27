import type { UnderstoodItem, WorldState } from "@repo/core";
import {
	FOUND_ITEMS,
	itemsText,
	PAGE_FACT,
	PAGE_LANG_FACT,
	readItems,
} from "@repo/core";
import {
	LANG_CHOSEN_FACT,
	PERSONA_LANG_FACT,
	USER_STORED_FACT,
} from "../goap/goap.types.ts";

/**
 * A message of several tasks runs as a queue of ordinary single-intent runs
 * (`plan_runs` chained by `root_run_id`). The queue and what the finished tasks
 * did are facts (JSON), so a run that stops to wait for the browser keeps them
 * in its checkpoint and the chain goes on after the resume.
 */
export const TASK_QUEUE_FACT = "taskQueue";
export const TASK_OUTCOMES_FACT = "taskOutcomes";
/** Epoch ms the queue began; rides along the turn so the visitor's clock survives a browser-tool pause. */
export const TASKS_STARTED_FACT = "tasksStartedAt";

export interface QueuedTask {
	intent: string;
	/** English words of the message that ask for this task. */
	text: string;
	/** Products and counts of the task, when `alpha-understand` listed them. */
	items?: UnderstoodItem[];
}

export interface TaskOutcome extends QueuedTask {
	ok: boolean;
	/** What the site gave back (a cart line, its own answer); absent when nothing is known. */
	result?: string;
}

function readList<T>(state: WorldState, key: string): T[] {
	const raw = state[key];
	if (typeof raw !== "string") return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as T[]) : [];
	} catch {
		return [];
	}
}

export const readQueue = (state: WorldState) =>
	readList<QueuedTask>(state, TASK_QUEUE_FACT);
export const readOutcomes = (state: WorldState) =>
	readList<TaskOutcome>(state, TASK_OUTCOMES_FACT);

/** More tasks wait behind this run: it is not the last, so it neither replies nor ends the stream. */
export const hasQueuedTasks = (state: WorldState): boolean =>
	readQueue(state).length > 0;

/** Both facts, `undefined` when empty (so spreading it over an older state clears them). */
export function chainFacts(
	queue: QueuedTask[],
	outcomes: TaskOutcome[],
): WorldState {
	return {
		[TASK_QUEUE_FACT]: queue.length > 0 ? JSON.stringify(queue) : undefined,
		[TASK_OUTCOMES_FACT]:
			outcomes.length > 0 ? JSON.stringify(outcomes) : undefined,
	};
}

/** The facts that describe the visitor's turn, not one task: they go from task to task. */
const TURN_FACTS = [
	"userMessage",
	"userMessageRaw",
	"catalogLang",
	TASKS_STARTED_FACT,
	"threadId",
	"userId",
	"channelId",
	PAGE_FACT,
	PAGE_LANG_FACT,
	LANG_CHOSEN_FACT,
	PERSONA_LANG_FACT,
	USER_STORED_FACT,
];

export function turnFacts(state: WorldState): WorldState {
	const kept: WorldState = {};
	for (const [key, value] of Object.entries(state)) {
		if (
			value !== undefined &&
			(TURN_FACTS.includes(key) || key.startsWith("customer:"))
		)
			kept[key] = value;
	}
	return kept;
}

/**
 * What a finished task did, for the final reply. `answer`: the site's last
 * answer of that run (`lastToolAnswer`).
 */
export function outcomeOf(
	started: WorldState,
	finalState: WorldState,
	ok: boolean,
	answer: string | undefined,
): TaskOutcome {
	const found = readItems(finalState, FOUND_ITEMS);
	const cart =
		ok && finalState.inCart === true && typeof finalState.product === "string"
			? `put in the cart: ${found.length > 1 ? itemsText(found) : finalState.product}`
			: undefined;
	const result = cart ?? answer?.slice(0, 300);
	return {
		intent: String(started.messageIntent ?? ""),
		text: String(started.userMessageEn ?? started.userMessage ?? ""),
		ok,
		...(result ? { result } : {}),
	};
}

/** The finished tasks as lines the reply model reads. A failed task says so: nothing may be claimed for it. */
export function outcomeLines(outcomes: TaskOutcome[]): string {
	return outcomes
		.map(
			(outcome, index) =>
				`${index + 1}. «${outcome.text}» — ${
					outcome.ok
						? `done${outcome.result ? `: ${outcome.result}` : ""}`
						: `NOT done${outcome.result ? ` (the site said: ${outcome.result})` : ""}`
				}`,
		)
		.join("; ");
}

/**
 * Where a queue stands, for the progress line: `done` tasks of `total`, and the
 * task being run (or the last one, once `finished`). `undefined` for a single
 * task — only a queue of two or more shows progress.
 */
export function progressOf(state: WorldState, finished: boolean) {
	const done = readOutcomes(state).length + (finished ? 1 : 0);
	const total = readOutcomes(state).length + 1 + readQueue(state).length;
	if (total < 2) return undefined;
	return {
		type: "progress" as const,
		done,
		total,
		current: String(state.userMessageEn ?? state.userMessage ?? ""),
		startedAt: Number(state[TASKS_STARTED_FACT]) || 0,
	};
}
