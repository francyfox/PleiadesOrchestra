import type { PlanTraceEvent } from "@repo/core";

export interface ActiveRun {
	runId: string;
	startedAt: number;
	/** Trace events so far — the same ones `finishPlanRun` will store when the run ends. */
	events: PlanTraceEvent[];
}

/** A run replans a handful of times; the cap only protects against a runaway loop. */
const DEFAULT_MAX_EVENTS = 500;

/**
 * Runs that are executing right now. A run's trace reaches SQLite only after
 * its terminal line (no write while tokens stream), so the admin panel cannot
 * see a run in progress there; this is what it reads instead to highlight the
 * operation being done. In memory by design: a run that dies with the process
 * has nothing left to highlight.
 */
export class ActiveRuns {
	private readonly runs = new Map<string, ActiveRun>();

	constructor(private readonly maxEvents = DEFAULT_MAX_EVENTS) {}

	start(runId: string, startedAt: number): void {
		this.runs.set(runId, { runId, startedAt, events: [] });
	}

	push(runId: string, event: PlanTraceEvent): void {
		const run = this.runs.get(runId);
		if (!run) return;
		run.events.push(event);
		if (run.events.length > this.maxEvents) run.events.shift();
	}

	finish(runId: string): void {
		this.runs.delete(runId);
	}

	get(runId: string): ActiveRun | undefined {
		return this.runs.get(runId);
	}

	ids(): string[] {
		return [...this.runs.keys()];
	}
}
