import type { LlmCallRecord, UsageRecorder } from "@repo/core";
import type { Db } from "./client.ts";
import type { RunBinding } from "./run-binding.ts";

/**
 * Buffers every model call in memory and writes them in one transaction on
 * `flush()` — the server flushes once a message's stream is done, so no
 * SQLite write happens while tokens are still streaming.
 */
export class SqliteUsageRecorder implements UsageRecorder {
	private buffer: LlmCallRecord[] = [];

	constructor(
		private readonly db: Db,
		private readonly runs: RunBinding,
	) {}

	record(call: LlmCallRecord): void {
		// Resolve the bound run now: by flush time the thread may be unbound.
		this.buffer.push({
			...call,
			planRunId: this.runs.resolve(call.threadId, call.planRunId),
		});
	}

	flush(): void {
		if (this.buffer.length === 0) return;
		const pending = this.buffer;
		this.buffer = [];
		const sqlite = this.db.$client;
		// Sub-selects instead of raw ids: a reference to a row that doesn't
		// exist (or was deleted meanwhile) becomes NULL rather than failing
		// the whole batch on a foreign key.
		const insert = sqlite.query(
			`INSERT INTO llm_calls (at, user_id, channel_id, thread_id, plan_run_id, action_name,
				kind, provider, model, input_tokens, output_tokens, latency_ms, ok, error)
			VALUES (?1, (SELECT id FROM users WHERE id = ?2), (SELECT channel_id FROM users WHERE id = ?2),
				(SELECT id FROM threads WHERE id = ?3), (SELECT id FROM plan_runs WHERE id = ?4), ?5,
				?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
		);
		sqlite.transaction(() => {
			for (const call of pending) {
				insert.run(
					call.at,
					call.userId,
					call.threadId,
					call.planRunId ?? null,
					call.actionName ?? null,
					call.kind,
					call.provider,
					call.model,
					call.inputTokens ?? null,
					call.outputTokens ?? null,
					call.latencyMs,
					call.ok ? 1 : 0,
					call.error ?? null,
				);
			}
		})();
	}
}
