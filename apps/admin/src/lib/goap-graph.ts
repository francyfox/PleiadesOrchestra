import type { GoapActionInfo, TraceEvent, WorldState } from "./api-types";

/**
 * Pure transforms from stored GOAP traces / the action catalog into graph,
 * table and timeline shapes. Rendering (xyflow, tables) lives in components;
 * everything decidable without the DOM is here, so it is unit-tested.
 */

export type RunNodeStatus =
	| "done"
	| "diverged"
	| "skipped"
	| "failed"
	| "started"
	| "not_reached"
	| "reached"
	| "missed";

export interface RunNodeData {
	[key: string]: unknown;
	kind: "action" | "goal" | "no_plan";
	label: string;
	attempt: number;
	status: RunNodeStatus;
	cost?: number;
	durationMs?: number;
	error?: string;
	tokens?: { input: number; output: number };
}

export interface GraphNode<TData> {
	id: string;
	position: { x: number; y: number };
	data: TData;
}

export interface GraphEdge {
	id: string;
	source: string;
	target: string;
	data: { kind: "next" | "replan" | "goal" | "fact" };
}

export interface RunGraph {
	nodes: GraphNode<RunNodeData>[];
	edges: GraphEdge[];
}

export interface LlmCallTokens {
	actionName: string | null;
	inputTokens: number | null;
	outputTokens: number | null;
}

const COLUMN_WIDTH = 220;
const LANE_HEIGHT = 130;

type Payload = Record<string, unknown>;

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};

function formatFact(key: string, value: unknown): string {
	return `${key}=${String(value)}`;
}

export function formatGoal(goal: WorldState): string {
	const entries = Object.entries(goal);
	if (entries.length === 0) return "goal";
	return entries.map(([key, value]) => formatFact(key, value)).join(", ");
}

/** Declared effects the action did not actually produce. */
function diverged(payload: Payload): boolean {
	const expected = asRecord(payload.expectedEffects);
	const observed = asRecord(payload.observedEffects);
	return Object.entries(expected).some(
		([key, value]) => observed[key] !== value,
	);
}

function tokensByAction(calls: LlmCallTokens[]) {
	const totals = new Map<string, { input: number; output: number }>();
	for (const call of calls) {
		if (!call.actionName) continue;
		const total = totals.get(call.actionName) ?? { input: 0, output: 0 };
		total.input += call.inputTokens ?? 0;
		total.output += call.outputTokens ?? 0;
		totals.set(call.actionName, total);
	}
	return totals;
}

interface Lane {
	attempt: number;
	nodes: GraphNode<RunNodeData>[];
}

/** One horizontal lane per planning attempt; a replan edge joins consecutive lanes. */
export function traceToGraph(
	events: TraceEvent[],
	goal: WorldState,
	llmCalls: LlmCallTokens[] = [],
): RunGraph {
	const tokens = tokensByAction(llmCalls);
	const lanes: Lane[] = [];
	let succeeded = false;

	for (const event of events) {
		const payload = event.payload;
		if (event.type === "planned") {
			const plan = Array.isArray(payload.plan) ? payload.plan : [];
			lanes.push({
				attempt: event.attempt,
				nodes: plan.map((step, index) => {
					const { name, cost } = asRecord(step);
					const label = String(name);
					const data: RunNodeData = {
						kind: "action",
						label,
						attempt: event.attempt,
						status: "not_reached",
						cost: typeof cost === "number" ? cost : undefined,
					};
					const actionTokens = tokens.get(label);
					if (actionTokens) data.tokens = actionTokens;
					return {
						id: `a${event.attempt}-${index}-${label}`,
						position: {
							x: index * COLUMN_WIDTH,
							y: event.attempt * LANE_HEIGHT,
						},
						data,
					};
				}),
			});
			continue;
		}
		if (event.type === "no_plan") {
			lanes.push({
				attempt: event.attempt,
				nodes: [
					{
						id: `a${event.attempt}-no-plan`,
						position: { x: 0, y: event.attempt * LANE_HEIGHT },
						data: {
							kind: "no_plan",
							label: "нет плана",
							attempt: event.attempt,
							status: "failed",
						},
					},
				],
			});
			continue;
		}
		if (event.type === "finished") {
			succeeded = payload.succeeded === true;
			continue;
		}

		const lane = lanes.findLast(
			(candidate) => candidate.attempt === event.attempt,
		);
		const node = lane?.nodes.find(
			(candidate) =>
				candidate.data.label === event.action &&
				(candidate.data.status === "not_reached" ||
					candidate.data.status === "started"),
		);
		if (!node) continue;
		const durationMs =
			typeof payload.durationMs === "number" ? payload.durationMs : undefined;
		switch (event.type) {
			case "action_started":
				node.data.status = "started";
				break;
			case "action_finished":
				node.data.status = diverged(payload) ? "diverged" : "done";
				node.data.durationMs = durationMs;
				break;
			case "action_failed":
				node.data.status = "failed";
				node.data.durationMs = durationMs;
				node.data.error = String(payload.error ?? "");
				break;
			case "action_skipped":
				node.data.status = "skipped";
				break;
		}
	}

	const nodes = lanes.flatMap((lane) => lane.nodes);
	const edges: GraphEdge[] = [];
	const link = (
		source: string,
		target: string,
		kind: GraphEdge["data"]["kind"],
	) =>
		edges.push({ id: `${source}->${target}`, source, target, data: { kind } });

	lanes.forEach((lane, laneIndex) => {
		lane.nodes.forEach((node, index) => {
			const next = lane.nodes[index + 1];
			if (next) link(node.id, next.id, "next");
		});
		const last = lane.nodes.at(-1);
		const nextLaneFirst = lanes[laneIndex + 1]?.nodes[0];
		if (last && nextLaneFirst) link(last.id, nextLaneFirst.id, "replan");
	});

	const lastLane = lanes.at(-1);
	const widest = Math.max(0, ...lanes.map((lane) => lane.nodes.length));
	const goalNode: GraphNode<RunNodeData> = {
		id: "goal",
		position: {
			x: widest * COLUMN_WIDTH,
			y: (lastLane?.attempt ?? 0) * LANE_HEIGHT,
		},
		data: {
			kind: "goal",
			label: formatGoal(goal),
			attempt: lastLane?.attempt ?? 0,
			status: succeeded ? "reached" : "missed",
		},
	};
	const lastNode = lastLane?.nodes.at(-1);
	if (lastNode) link(lastNode.id, goalNode.id, "goal");

	return { nodes: [...nodes, goalNode], edges };
}

export interface EffectRow {
	attempt: number;
	action: string;
	key: string;
	expected: unknown;
	observed: unknown;
	/** `extra` — produced but not declared, informational only. */
	match: "ok" | "mismatch" | "extra";
}

export function effectsRows(events: TraceEvent[]): EffectRow[] {
	const rows: EffectRow[] = [];
	for (const event of events) {
		if (event.type !== "action_finished" || !event.action) continue;
		const expected = asRecord(event.payload.expectedEffects);
		const observed = asRecord(event.payload.observedEffects);
		const keys = [
			...new Set([...Object.keys(expected), ...Object.keys(observed)]),
		];
		for (const key of keys) {
			const declared = key in expected;
			rows.push({
				attempt: event.attempt,
				action: event.action,
				key,
				expected: expected[key],
				observed: observed[key],
				match: !declared
					? "extra"
					: expected[key] === observed[key]
						? "ok"
						: "mismatch",
			});
		}
	}
	return rows;
}

export interface TimelineBar {
	attempt: number;
	action: string;
	offsetMs: number;
	durationMs: number;
	status: "done" | "failed";
}

export function timelineBars(events: TraceEvent[]): TimelineBar[] {
	const origin = events[0]?.at ?? 0;
	const bars: TimelineBar[] = [];
	for (const event of events) {
		if (event.type !== "action_finished" && event.type !== "action_failed")
			continue;
		const durationMs =
			typeof event.payload.durationMs === "number"
				? event.payload.durationMs
				: 0;
		bars.push({
			attempt: event.attempt,
			action: event.action ?? "",
			offsetMs: event.at - durationMs - origin,
			durationMs,
			status: event.type === "action_finished" ? "done" : "failed",
		});
	}
	return bars;
}

export interface CatalogNodeData {
	[key: string]: unknown;
	kind: "action" | "fact";
	label: string;
	cost?: number;
}

export interface CatalogGraph {
	nodes: GraphNode<CatalogNodeData>[];
	edges: GraphEdge[];
}

const ROW_HEIGHT = 80;

/**
 * Catalog as a bipartite graph: fact → action (precondition) and
 * action → fact (effect). Columns follow dependency depth; the rank
 * iteration is capped so cyclic catalogs still terminate.
 */
export function catalogToGraph(actions: GoapActionInfo[]): CatalogGraph {
	const factId = (key: string, value: unknown) =>
		`fact:${formatFact(key, value)}`;
	const actionId = (name: string) => `action:${name}`;

	const facts = new Map<string, string>();
	const producers = new Map<string, string[]>();
	const edges: GraphEdge[] = [];

	for (const action of actions) {
		for (const [key, value] of Object.entries(action.preconditions)) {
			const id = factId(key, value);
			facts.set(id, formatFact(key, value));
			edges.push({
				id: `${id}->${actionId(action.name)}`,
				source: id,
				target: actionId(action.name),
				data: { kind: "fact" },
			});
		}
		for (const [key, value] of Object.entries(action.effects)) {
			const id = factId(key, value);
			facts.set(id, formatFact(key, value));
			producers.set(id, [...(producers.get(id) ?? []), actionId(action.name)]);
			edges.push({
				id: `${actionId(action.name)}->${id}`,
				source: actionId(action.name),
				target: id,
				data: { kind: "fact" },
			});
		}
	}

	const rank = new Map<string, number>();
	for (const action of actions) rank.set(actionId(action.name), 0);
	for (const id of facts.keys()) rank.set(id, 0);

	for (
		let iteration = 0;
		iteration < actions.length + facts.size + 1;
		iteration++
	) {
		let changed = false;
		const bump = (id: string, value: number) => {
			if ((rank.get(id) ?? 0) < value) {
				rank.set(id, value);
				changed = true;
			}
		};
		for (const [id, producedBy] of producers) {
			bump(
				id,
				Math.max(...producedBy.map((producer) => rank.get(producer) ?? 0)) + 1,
			);
		}
		for (const action of actions) {
			const inputs = Object.entries(action.preconditions).map(
				([key, value]) => rank.get(factId(key, value)) ?? 0,
			);
			if (inputs.length > 0)
				bump(actionId(action.name), Math.max(...inputs) + 1);
		}
		if (!changed) break;
	}

	const rows = new Map<number, number>();
	const place = (id: string) => {
		const column = rank.get(id) ?? 0;
		const row = rows.get(column) ?? 0;
		rows.set(column, row + 1);
		return { x: column * COLUMN_WIDTH, y: row * ROW_HEIGHT };
	};

	const nodes: GraphNode<CatalogNodeData>[] = [
		...actions.map((action) => ({
			id: actionId(action.name),
			position: place(actionId(action.name)),
			data: { kind: "action" as const, label: action.name, cost: action.cost },
		})),
		...[...facts].map(([id, label]) => ({
			id,
			position: place(id),
			data: { kind: "fact" as const, label },
		})),
	];

	return { nodes, edges };
}
