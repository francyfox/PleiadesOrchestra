import { describe, expect, test } from "bun:test";
import type { GoapActionInfo, TraceEvent } from "./api-types";
import {
	catalogToGraph,
	effectsRows,
	timelineBars,
	traceToGraph,
} from "./goap-graph";

let seq = 0;
function ev(
	type: TraceEvent["type"],
	attempt: number,
	action: string | null,
	payload: Record<string, unknown>,
	at: number,
): TraceEvent {
	return { seq: seq++, type, attempt, action, payload, at };
}

/** Attempt 0: classify ok, reply "succeeds" but misses its effect → replan. Attempt 1: reply ok. */
const replanTrace: TraceEvent[] = [
	ev(
		"planned",
		0,
		null,
		{
			plan: [
				{ name: "classify", cost: 1 },
				{ name: "reply", cost: 5 },
			],
			totalCost: 6,
			state: {},
		},
		1000,
	),
	ev("action_started", 0, "classify", {}, 1000),
	ev(
		"action_finished",
		0,
		"classify",
		{
			durationMs: 10,
			expectedEffects: { classified: true },
			observedEffects: { classified: true },
		},
		1010,
	),
	ev("action_started", 0, "reply", {}, 1010),
	ev(
		"action_finished",
		0,
		"reply",
		{
			durationMs: 90,
			expectedEffects: { replied: true },
			observedEffects: { replied: false, replyText: "" },
		},
		1100,
	),
	ev("replan", 0, null, { state: { classified: true, replied: false } }, 1100),
	ev(
		"planned",
		1,
		null,
		{ plan: [{ name: "reply", cost: 5 }], totalCost: 5, state: {} },
		1100,
	),
	ev("action_started", 1, "reply", {}, 1100),
	ev(
		"action_finished",
		1,
		"reply",
		{
			durationMs: 200,
			expectedEffects: { replied: true },
			observedEffects: { replied: true },
		},
		1300,
	),
	ev(
		"finished",
		1,
		null,
		{ succeeded: true, attempts: 2, durationMs: 300 },
		1300,
	),
];

describe("traceToGraph", () => {
	test("one lane per attempt, action nodes in plan order, then the goal", () => {
		const graph = traceToGraph(replanTrace, { replied: true });

		const actions = graph.nodes.filter((n) => n.data.kind === "action");
		const lane0 = actions.filter((n) => n.data.attempt === 0);
		const lane1 = actions.filter((n) => n.data.attempt === 1);
		expect(lane0.map((n) => n.data.label)).toEqual(["classify", "reply"]);
		expect(lane1.map((n) => n.data.label)).toEqual(["reply"]);

		// lanes are stacked vertically, actions laid out left to right
		expect(lane1[0]?.position.y).toBeGreaterThan(lane0[0]?.position.y ?? 0);
		expect(lane0[1]?.position.x).toBeGreaterThan(lane0[0]?.position.x ?? 0);

		const goal = graph.nodes.find((n) => n.data.kind === "goal");
		expect(goal?.data).toMatchObject({
			status: "reached",
			label: "replied=true",
		});
	});

	test("node status and duration come from the execution events", () => {
		const graph = traceToGraph(replanTrace, { replied: true });
		const [classify, reply0] = graph.nodes.filter((n) => n.data.attempt === 0);
		expect(classify?.data).toMatchObject({
			status: "done",
			cost: 1,
			durationMs: 10,
		});
		// "finished" but its effects diverged from what the planner expected
		expect(reply0?.data).toMatchObject({ status: "diverged", durationMs: 90 });
	});

	test("edges chain a lane, jump to the next lane on replan, and end at the goal", () => {
		const graph = traceToGraph(replanTrace, { replied: true });
		const byId = new Map(graph.nodes.map((n) => [n.id, n]));
		const label = (id: string) => byId.get(id)?.data.label;

		const pairs = graph.edges.map((e) => [
			label(e.source),
			label(e.target),
			e.data.kind,
		]);
		expect(pairs).toEqual([
			["classify", "reply", "next"],
			["reply", "reply", "replan"],
			["reply", "replied=true", "goal"],
		]);
	});

	test("skipped, failed and never-reached actions are distinguished", () => {
		const trace: TraceEvent[] = [
			ev(
				"planned",
				0,
				null,
				{
					plan: [
						{ name: "a", cost: 1 },
						{ name: "b", cost: 1 },
						{ name: "c", cost: 1 },
					],
					totalCost: 3,
					state: {},
				},
				0,
			),
			ev("action_skipped", 0, "a", { unmetPreconditions: { x: true } }, 0),
			ev("action_started", 0, "b", {}, 0),
			ev("action_failed", 0, "b", { durationMs: 5, error: "boom" }, 5),
			ev(
				"finished",
				0,
				null,
				{ succeeded: false, attempts: 1, durationMs: 5 },
				5,
			),
		];
		const graph = traceToGraph(trace, { done: true });
		const statuses = graph.nodes.map((n) => [n.data.label, n.data.status]);
		expect(statuses).toEqual([
			["a", "skipped"],
			["b", "failed"],
			["c", "not_reached"],
			["done=true", "missed"],
		]);
		expect(graph.nodes[1]?.data.error).toBe("boom");
	});

	test("an attempt with no plan gets a single failed placeholder node", () => {
		const trace: TraceEvent[] = [
			ev("no_plan", 0, null, { state: {} }, 0),
			ev(
				"finished",
				0,
				null,
				{ succeeded: false, attempts: 1, durationMs: 0 },
				0,
			),
		];
		const graph = traceToGraph(trace, { replied: true });
		expect(graph.nodes.map((n) => [n.data.kind, n.data.status])).toEqual([
			["no_plan", "failed"],
			["goal", "missed"],
		]);
	});

	test("attaches tokens per action when llm calls are given", () => {
		const graph = traceToGraph(replanTrace, { replied: true }, [
			{ actionName: "reply", inputTokens: 10, outputTokens: 5 },
			{ actionName: "reply", inputTokens: 1, outputTokens: null },
		]);
		const reply = graph.nodes.find((n) => n.data.label === "reply");
		expect(reply?.data.tokens).toEqual({ input: 11, output: 5 });
	});
});

describe("effectsRows", () => {
	test("one row per fact, mismatches flagged, undeclared facts marked extra", () => {
		const rows = effectsRows(replanTrace);
		expect(rows).toEqual([
			{
				attempt: 0,
				action: "classify",
				key: "classified",
				expected: true,
				observed: true,
				match: "ok",
			},
			{
				attempt: 0,
				action: "reply",
				key: "replied",
				expected: true,
				observed: false,
				match: "mismatch",
			},
			{
				attempt: 0,
				action: "reply",
				key: "replyText",
				expected: undefined,
				observed: "",
				match: "extra",
			},
			{
				attempt: 1,
				action: "reply",
				key: "replied",
				expected: true,
				observed: true,
				match: "ok",
			},
		]);
	});
});

describe("timelineBars", () => {
	test("bars are offset from the first event and keep their status", () => {
		expect(timelineBars(replanTrace)).toEqual([
			{
				attempt: 0,
				action: "classify",
				offsetMs: 0,
				durationMs: 10,
				status: "done",
			},
			{
				attempt: 0,
				action: "reply",
				offsetMs: 10,
				durationMs: 90,
				status: "done",
			},
			{
				attempt: 1,
				action: "reply",
				offsetMs: 100,
				durationMs: 200,
				status: "done",
			},
		]);
	});
});

describe("catalogToGraph", () => {
	const actions: GoapActionInfo[] = [
		{
			name: "reply",
			cost: 5,
			preconditions: { classified: true },
			effects: { replied: true },
		},
		{
			name: "classify",
			cost: 1,
			preconditions: {},
			effects: { classified: true },
		},
	];

	test("fact → action → fact edges from preconditions and effects", () => {
		const graph = catalogToGraph(actions);
		const edges = graph.edges.map((e) => `${e.source}->${e.target}`).sort();
		expect(edges).toEqual([
			"action:classify->fact:classified=true",
			"action:reply->fact:replied=true",
			"fact:classified=true->action:reply",
		]);
	});

	test("columns follow dependency depth", () => {
		const graph = catalogToGraph(actions);
		const x = (id: string) =>
			graph.nodes.find((n) => n.id === id)?.position.x ?? -1;
		expect(x("action:classify")).toBeLessThan(x("fact:classified=true"));
		expect(x("fact:classified=true")).toBeLessThan(x("action:reply"));
		expect(x("action:reply")).toBeLessThan(x("fact:replied=true"));
	});

	test("cycles terminate", () => {
		const cyclic: GoapActionInfo[] = [
			{ name: "a", cost: 1, preconditions: { y: true }, effects: { x: true } },
			{ name: "b", cost: 1, preconditions: { x: true }, effects: { y: true } },
		];
		expect(catalogToGraph(cyclic).nodes).toHaveLength(4);
	});
});
