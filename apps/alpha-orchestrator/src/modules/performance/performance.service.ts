import type { Db } from "../database/database.ts";
import { dayOf } from "../usage/usage.sql.ts";

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

function tokensPerSecond(rows: CallRow[]): number | null {
	const rates = rows
		.filter((r) => r.ok && r.outputTokens !== null && r.latencyMs > 0)
		.map((r) => (r.outputTokens as number) / (r.latencyMs / 1000));
	const rate = median(rates);
	return rate === null ? null : Math.round(rate * 10) / 10;
}

/** Stats of one group. `rows` must already be sorted by latency (ascending). */
function summarize(rows: CallRow[]): LatencyStats {
	const latencies = rows.map((r) => r.latencyMs);
	return {
		calls: rows.length,
		failed: rows.filter((r) => !r.ok).length,
		p50: percentile(latencies, 50),
		p90: percentile(latencies, 90),
		p99: percentile(latencies, 99),
		max: latencies.at(-1) ?? 0,
		tokensPerSecond: tokensPerSecond(rows),
	};
}

function pushTo<K>(groups: Map<K, CallRow[]>, key: K, row: CallRow): void {
	const list = groups.get(key);
	if (list) list.push(row);
	else groups.set(key, [row]);
}

/**
 * Latency percentiles of model calls from the `llm_calls` ledger, per UTC
 * day × call kind and for the whole period. SQLite has no percentile
 * function, so the period's calls are read here. The query hands them back
 * ordered by latency, so every group built in a single pass is already
 * sorted — no per-group sort in JS.
 */
export function performance(db: Db, from: number, to: number) {
	const rows = db.$client
		.query<CallRow, [number, number]>(
			`SELECT ${dayOf("at")} AS day, kind,
				latency_ms AS latencyMs, output_tokens AS outputTokens, ok
			FROM llm_calls WHERE at >= ? AND at <= ?
			ORDER BY kind, latency_ms`,
		)
		.all(from, to);

	const perDay = new Map<
		string,
		{ day: string; kind: Kind; rows: CallRow[] }
	>();
	const perKind = new Map<Kind, CallRow[]>();
	for (const row of rows) {
		pushTo(perKind, row.kind, row);
		const key = `${row.day}|${row.kind}`;
		const group = perDay.get(key);
		if (group) group.rows.push(row);
		else perDay.set(key, { day: row.day, kind: row.kind, rows: [row] });
	}

	return {
		rows: [...perDay.values()]
			.sort((a, b) => compare(a.day, b.day) || compare(a.kind, b.kind))
			.map(({ day, kind, rows }) => ({ day, kind, ...summarize(rows) })),
		overall: [...perKind]
			.sort(([a], [b]) => compare(a, b))
			.map(([kind, rows]) => ({ kind, ...summarize(rows) })),
	};
}

function compare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
