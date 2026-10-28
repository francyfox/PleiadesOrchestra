import type { LlmCallRecord, UsageRecorder } from "@repo/core";
import type { Db } from "../database/database.ts";
import { usdToMicro } from "../ledger/ledger.service.ts";
import { costUsd, type Prices } from "../prices/prices.service.ts";
import type { RunBinding } from "../run-binding/run-binding.ts";

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
		/** Current model prices (sync, may be unknown) and where debit failures go. */
		private readonly billing: {
			prices?: () => Prices | null;
			log?: (message: string) => void;
			/** Called once per account debited by a flush, after the transaction. */
			onDebited?: (accountId: string) => void;
		} = {},
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
			`INSERT INTO llm_calls (at, visitor_id, channel_id, thread_id, plan_run_id, action_name,
				kind, provider, model, input_tokens, output_tokens, latency_ms, ok, error, confidence, choices,
				prompt, response, attempts, failed_statuses)
			VALUES (?1, (SELECT id FROM visitors WHERE id = ?2), (SELECT channel_id FROM visitors WHERE id = ?2),
				(SELECT id FROM threads WHERE id = ?3), (SELECT id FROM plan_runs WHERE id = ?4), ?5,
				?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`,
		);
		// The owner is read from the stored call: staff channels (NULL owner) and deleted ones debit nothing.
		const debit = sqlite.query<
			{ account_id: string },
			[number, number | bigint, number]
		>(
			`INSERT INTO credit_ledger (account_id, amount, reason, ref, created_at)
			SELECT owner_id, -?1, 'usage', ?2, ?3 FROM channels
			WHERE id = (SELECT channel_id FROM llm_calls WHERE id = ?2) AND owner_id IS NOT NULL
			RETURNING account_id`,
		);
		const prices = this.billing.prices?.();
		const debited = new Set<string>();
		sqlite.transaction(() => {
			for (const call of pending) {
				const { lastInsertRowid } = insert.run(
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
					call.confidence ?? null,
					call.choices ? JSON.stringify(call.choices) : null,
					call.prompt ?? null,
					call.response ?? null,
					call.attempts ?? null,
					call.failedStatuses ? JSON.stringify(call.failedStatuses) : null,
				);
				const micro = usdToMicro(
					costUsd(
						call.inputTokens ?? 0,
						call.outputTokens ?? 0,
						prices?.get(call.model),
					),
				);
				// A failed debit must not lose the usage rows or fail the reply.
				if (micro > 0)
					try {
						const row = debit.get(micro, lastInsertRowid, call.at);
						if (row) debited.add(row.account_id);
					} catch (error) {
						this.billing.log?.(`ledger debit failed: ${String(error)}`);
					}
			}
		})();
		for (const accountId of debited) this.billing.onDebited?.(accountId);
	}
}
