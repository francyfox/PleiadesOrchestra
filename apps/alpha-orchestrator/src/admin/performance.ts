import type { Db } from "../db/client.ts";

type Kind = "ingest" | "generate" | "decision";

export interface LatencyStats {
	calls: number;
	failed: number;
	p50: number;
	p90: number;
	p99: number;
	max: number;
	/** Median output tokens/s over successful calls that reported usage; null if none (e.g. Laya). */
	tokensPerSecond: number | null;
}

interface CallRow {
	day: string;
	kind: Kind;
	latencyMs: number;
	outputTokens: number | null;
	ok: number;
}

/** Nearest-rank percentile over ascending values. */
function percentile(sorted: number[], p: number): number {
	return sorted[Math.max(Math.ceil((p / 100) * sorted.length) - 1, 0)] ?? 0;
}

function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length / 2;
	return Number.isInteger(mid)
		? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
		: (sorted[Math.floor(mid)] as number);
}

function summarize(rows: CallRow[]): LatencyStats {
	const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
	const rates = rows
		.filter((r) => r.ok && r.outputTokens !== null && r.latencyMs > 0)
		.map((r) => (r.outputTokens as number) / (r.latencyMs / 1000));
	const tps = median(rates);
	return {
		calls: rows.length,
		failed: rows.filter((r) => !r.ok).length,
		p50: percentile(latencies, 50),
		p90: percentile(latencies, 90),
		p99: percentile(latencies, 99),
		max: latencies.at(-1) ?? 0,
		tokensPerSecond: tps === null ? null : Math.round(tps * 10) / 10,
	};
}

function groupBy<K extends string>(rows: CallRow[], key: (r: CallRow) => K) {
	const groups = new Map<K, CallRow[]>();
	for (const row of rows) {
		const k = key(row);
		const list = groups.get(k);
		if (list) list.push(row);
		else groups.set(k, [row]);
	}
	return [...groups].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Latency percentiles of model calls from the `llm_calls` ledger, per UTC
 * day × call kind and for the whole period. SQLite has no percentile
 * function, so the period's latencies are pulled and ranked here — fine at
 * this scale (one short row per model call).
 */
export function performance(db: Db, from: number, to: number) {
	const rows = db.$client
		.query<CallRow, [number, number]>(
			`SELECT strftime('%Y-%m-%d', at / 1000, 'unixepoch') AS day, kind,
				latency_ms AS latencyMs, output_tokens AS outputTokens, ok
			FROM llm_calls WHERE at >= ? AND at <= ?`,
		)
		.all(from, to);

	return {
		rows: groupBy(rows, (r) => `${r.day}\u0000${r.kind}`).map(
			([key, group]) => {
				const [day, kind] = key.split("\u0000") as [string, Kind];
				return { day, kind, ...summarize(group) };
			},
		),
		overall: groupBy(rows, (r) => r.kind).map(([kind, group]) => ({
			kind,
			...summarize(group),
		})),
	};
}
