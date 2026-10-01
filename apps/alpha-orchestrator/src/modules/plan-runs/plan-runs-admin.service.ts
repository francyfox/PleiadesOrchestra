import type { Db } from "../database/database.ts";

/** A run with its trace events and the model calls it made, for the admin run view. */
export function getRun(db: Db, id: string) {
	const sqlite = db.$client;
	const run = sqlite
		.query<
			{
				id: string;
				userId: string;
				threadId: string;
				goal: string;
				succeeded: number;
				attempts: number;
				durationMs: number;
				createdAt: number;
			},
			[string]
		>(
			`SELECT id, user_id AS userId, thread_id AS threadId, goal, succeeded, attempts,
				duration_ms AS durationMs, created_at AS createdAt FROM plan_runs WHERE id = ?`,
		)
		.get(id);
	if (!run) return null;

	const events = sqlite
		.query<
			{
				seq: number;
				type: string;
				attempt: number;
				action: string | null;
				payload: string;
				at: number;
			},
			[string]
		>(
			"SELECT seq, type, attempt, action, payload, at FROM plan_events WHERE run_id = ? ORDER BY seq",
		)
		.all(id)
		.map((event) => ({ ...event, payload: JSON.parse(event.payload) }));

	const llmCalls = sqlite
		.query<Record<string, unknown> & { ok: number }, [string]>(
			`SELECT action_name AS actionName, kind, model, input_tokens AS inputTokens,
				output_tokens AS outputTokens, latency_ms AS latencyMs, ok, at
			FROM llm_calls WHERE plan_run_id = ? ORDER BY at, id`,
		)
		.all(id)
		.map((call) => ({ ...call, ok: call.ok === 1 }));

	return {
		run: { ...run, goal: JSON.parse(run.goal), succeeded: run.succeeded === 1 },
		events,
		llmCalls,
	};
}

export interface DynamicActionSummary {
	name: string;
	/** From the `planned` event that scheduled it — `null` if that run only ever `action_skipped`ed it. */
	cost: number | null;
	/** The action's declared `effects` as of its most recent `action_finished` event. */
	effects: Record<string, unknown>;
	lastSeenAt: number;
}

interface EventRow {
	type: string;
	action: string | null;
	payload: string;
	at: number;
}

/**
 * Actions that are not in the static `/goap/actions` catalog because they only
 * exist per thread — WebMCP tools sent by a visitor's browser. There is no live
 * listing for them, so this rebuilds one from the user's own `plan_events`:
 * cost from the `planned` step that scheduled the action, effects from its
 * latest `action_finished`. Preconditions can't be recovered (no trace event
 * carries them) and are omitted rather than guessed.
 */
export function dynamicActionsForUser(
	db: Db,
	userId: string,
	staticActionNames: ReadonlySet<string>,
): DynamicActionSummary[] {
	// One query for both event types, joined to the user's runs in SQL.
	const events = db.$client
		.query<EventRow, [string]>(
			`SELECT e.type, e.action, e.payload, e.at
			FROM plan_events e JOIN plan_runs r ON r.id = e.run_id
			WHERE r.user_id = ? AND e.type IN ('planned', 'action_finished')
			ORDER BY e.at, e.run_id, e.seq`,
		)
		.all(userId);

	const costs = plannedCosts(events);
	const byName = new Map<string, DynamicActionSummary>();
	for (const event of events) {
		if (event.type !== "action_finished") continue;
		if (!event.action || staticActionNames.has(event.action)) continue;
		const payload = JSON.parse(event.payload) as {
			expectedEffects?: Record<string, unknown>;
		};
		byName.set(event.action, {
			name: event.action,
			cost: costs.get(event.action) ?? null,
			effects: payload.expectedEffects ?? {},
			lastSeenAt: event.at,
		});
	}
	return [...byName.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

/** Cost of each action as the planner last scheduled it. */
function plannedCosts(events: EventRow[]): Map<string, number> {
	const costs = new Map<string, number>();
	for (const event of events) {
		if (event.type !== "planned") continue;
		const payload = JSON.parse(event.payload) as {
			plan?: { name: string; cost: number }[];
		};
		for (const step of payload.plan ?? []) costs.set(step.name, step.cost);
	}
	return costs;
}
