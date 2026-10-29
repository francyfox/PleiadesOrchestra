import type { RecordedRun, ReplayCall } from "./replay.types.ts";

export const callKey = (run: string, index: number) => `${run}:${index}`;

/**
 * The language-model calls of the runs (a saved prompt), each model's together:
 * replayed model by model, one model stays loaded and no swap lands in a call.
 */
export function groupByModel(runs: RecordedRun[]) {
	const groups = new Map<string, ReplayCall[]>();
	for (const run of runs) {
		run.detail.llmCalls.forEach((call, index) => {
			if (!call.prompt) return;
			const group = groups.get(call.model) ?? [];
			group.push({ ...call, run: run.id, index });
			groups.set(call.model, group);
		});
	}
	return groups;
}

/**
 * A run's time with its model calls taken from the warm replay: the recorded
 * calls (a model swap included) out, the replayed ones in; code, tools and the
 * calls without a prompt (gamma) stay as recorded.
 */
export function replayedLatency(
	run: RecordedRun,
	replayed: Map<string, number>,
): number {
	return run.detail.llmCalls.reduce((ms, call, index) => {
		const warm = replayed.get(callKey(run.id, index));
		return warm === undefined ? ms : ms - call.latencyMs + warm;
	}, run.latencyMs);
}

/** Sorted keys, so the order a model writes them in does not matter. */
const canonical = (value: unknown): unknown =>
	Array.isArray(value)
		? value.map(canonical)
		: value && typeof value === "object"
			? Object.fromEntries(
					Object.entries(value)
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([k, v]) => [k, canonical(v)]),
				)
			: value;

/** Two tool-argument objects the site would treat the same: equal values, any key order. */
export function sameArguments(a: unknown, b: unknown): boolean {
	return (
		a !== undefined &&
		b !== undefined &&
		JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
	);
}
