import { describe, expect, test } from "bun:test";
import type { RequestNode, RequestView } from "admin-api/types";
import {
	type ChoiceNodeData,
	elapsedMs,
	MAX_OPTIONS,
	viewToGraph,
} from "./request-graph.ts";

const detail = {
	text: null,
	intent: null,
	goal: null,
	tool: null,
	toolArgs: null,
	browserMs: null,
	understood: null,
	expected: null,
	effects: null,
	changes: null,
	plan: null,
	error: null,
	calls: [],
};
const node = (
	id: string,
	kind: RequestNode["kind"],
	round: number,
	status: RequestNode["status"] = "done",
	durationMs: number | null = null,
): RequestNode => ({
	id,
	kind,
	label: id,
	round,
	status,
	startedAt: null,
	durationMs,
	detail,
});

const view = (
	nodes: RequestNode[],
	edges: RequestView["edges"],
): RequestView => ({
	request: {
		id: "r",
		visitorId: "u",
		threadId: "t",
		prompt: "p",
		intent: null,
		status: "succeeded",
		goal: {},
		reply: null,
		startedAt: 0,
		durationMs: 0,
	},
	nodes,
	edges,
	now: 0,
});

describe("viewToGraph", () => {
	test("prompt and understanding come first, steps follow in a row, the result closes it", () => {
		const graph = viewToGraph(
			view(
				[
					node("prompt", "prompt", 0),
					node("understand", "understand", 0),
					node("1:a", "action", 1),
					node("1:b", "action", 1),
					node("result", "result", 0, "reached"),
				],
				[],
			),
		);
		const at = (id: string) => graph.nodes.find((n) => n.id === id)?.position;
		expect(at("prompt")).toEqual({ x: 0, y: 0 });
		expect(at("understand")?.x).toBeGreaterThan(0);
		expect(at("1:a")?.y).toBe(0);
		expect(at("1:b")?.x).toBeGreaterThan(at("1:a")?.x ?? 0);
		expect(at("result")?.x).toBeGreaterThan(at("1:b")?.x ?? 0);
		expect(at("result")?.y).toBe(0);
	});

	test("a translation sits between the prompt and the understanding and pushes the rest one column right", () => {
		const graph = viewToGraph(
			view(
				[
					node("prompt", "prompt", 0),
					node("translate", "translate", 0),
					node("understand", "understand", 0),
					node("1:a", "action", 1),
					node("result", "result", 0, "reached"),
				],
				[],
			),
		);
		const x = (id: string) => graph.nodes.find((n) => n.id === id)?.position.x;
		expect(x("prompt")).toBeLessThan(x("translate") ?? 0);
		expect(x("translate")).toBeLessThan(x("understand") ?? 0);
		expect(x("understand")).toBeLessThan(x("1:a") ?? 0);
		expect(x("1:a")).toBeLessThan(x("result") ?? 0);
	});

	test("translation, intent decision and understanding each get a column before the plan", () => {
		const graph = viewToGraph(
			view(
				[
					node("prompt", "prompt", 0),
					node("translate", "translate", 0),
					node("classify", "classify", 0),
					node("understand", "understand", 0),
					node("1:a", "action", 1),
					node("result", "result", 0, "reached"),
				],
				[],
			),
		);
		const columns = [
			"prompt",
			"translate",
			"classify",
			"understand",
			"1:a",
			"result",
		].map((id) => graph.nodes.find((n) => n.id === id)?.position.x ?? -1);
		expect([...columns].sort((a, b) => a - b)).toEqual(columns);
		expect(new Set(columns).size).toBe(6);
	});

	test("a replan round drops to its own row and continues to the right", () => {
		const graph = viewToGraph(
			view(
				[
					node("prompt", "prompt", 0),
					node("understand", "understand", 0),
					node("1:a", "action", 1),
					node("2:b", "action", 2),
					node("result", "result", 0, "missed"),
				],
				[{ from: "1:a", to: "2:b", kind: "replan" }],
			),
		);
		const at = (id: string) => graph.nodes.find((n) => n.id === id)?.position;
		expect(at("2:b")?.y).toBeGreaterThan(at("1:a")?.y ?? 0);
		expect(at("2:b")?.x).toBeGreaterThan(at("1:a")?.x ?? 0);
		// The result sits on the row where the request ended.
		expect(at("result")?.y).toBe(at("2:b")?.y);
		expect(graph.edges.find((e) => e.data.kind === "replan")).toMatchObject({
			source: "1:a",
			target: "2:b",
		});
	});

	test("nodes in progress are marked live, finished ones are not", () => {
		const graph = viewToGraph(
			view(
				[
					node("prompt", "prompt", 0),
					node("1:a", "action", 1, "running", 400),
					node("1:b", "action", 1, "browser", 900),
					node("1:c", "action", 1, "pending"),
				],
				[],
			),
		);
		const live = (id: string) =>
			graph.nodes.find((n) => n.id === id)?.data.live;
		expect(live("prompt")).toBe(false);
		expect(live("1:a")).toBe(true);
		expect(live("1:b")).toBe(true);
		expect(live("1:c")).toBe(false);
	});
});

describe("elapsedMs", () => {
	test("a running step keeps counting from the snapshot, a finished one stands still", () => {
		expect(elapsedMs(400, true, 1_000, 1_750)).toBe(1_150);
		expect(elapsedMs(400, false, 1_000, 1_750)).toBe(400);
		expect(elapsedMs(null, true, 1_000, 1_750)).toBeNull();
	});

	test("a clock that went back never shows less than the snapshot", () => {
		expect(elapsedMs(400, true, 1_000, 900)).toBe(400);
	});
});

describe("viewToGraph choices", () => {
	const withChoices = (
		id: string,
		kind: RequestNode["kind"],
		round: number,
	) => {
		const base = node(id, kind, round);
		const call = (choices: unknown) => ({
			provider: "p",
			model: "m",
			latencyMs: 1,
			inputTokens: null,
			outputTokens: null,
			ok: true,
			error: null,
			choices,
		});
		return {
			...base,
			detail: {
				...base.detail,
				calls: [
					call([
						{
							question: "q1",
							chosen: "b",
							options: { a: 0.1, b: 0.7, c: 0.2 },
						},
						{
							question: "q2",
							chosen: "x0",
							options: Object.fromEntries(
								Array.from({ length: 15 }, (_, i) => [`x${i}`, 1 - i / 20]),
							),
						},
						{
							question: "q3",
							chosen: "z",
							options: { y: 0.96, z: 0.01, w: 0.02, v: 0.01 },
						},
					]),
				],
			},
		} as unknown as RequestNode;
	};
	const graph = viewToGraph(
		view(
			[
				node("prompt", "prompt", 0),
				withChoices("classify", "classify", 0),
				node("understand", "understand", 0),
				node("1:a", "action", 1),
				node("result", "result", 1),
			],
			[{ from: "prompt", to: "classify", kind: "next" }],
		),
	);
	const choice = graph.nodes.filter((n) => n.type === "choice");

	test("one node and one edge per question: sorted, chosen marked, capped with a tail", () => {
		expect(choice.map((n) => n.data.question)).toEqual(["q1", "q2", "q3"]);
		const [first, second] = choice.map((n) => n.data as ChoiceNodeData);
		expect(first?.options.map((o) => o.option)).toEqual(["b", "c", "a"]);
		expect(first?.options.filter((o) => o.chosen).map((o) => o.option)).toEqual(
			["b"],
		);
		expect(first?.more).toBe(0);
		expect(second?.options).toHaveLength(MAX_OPTIONS);
		expect(second?.more).toBe(15 - MAX_OPTIONS);
		expect(second?.moreProbability).toBeCloseTo(0.4 + 0.35 + 0.3);
		expect(graph.edges.filter((e) => e.data.kind === "choice")).toHaveLength(3);
	});

	test("unlikely options share one row; the chosen one stays even when unlikely", () => {
		const third = choice[2]?.data as ChoiceNodeData;
		expect(third.options.map((o) => o.option)).toEqual(["y", "z"]);
		expect(third.more).toBe(2);
		expect(third.moreProbability).toBeCloseTo(0.03);
	});

	test("questions sit below the main flow without overlapping, ids are unique, edges point to existing nodes", () => {
		const mainBottom = Math.max(
			...graph.nodes
				.filter((n) => n.type === "request")
				.map((n) => n.position.y),
		);
		for (const n of choice)
			expect(n.position.y).toBeGreaterThan(mainBottom + 100);
		const ids = graph.nodes.map((n) => n.id);
		expect(new Set(ids).size).toBe(ids.length);
		const known = new Set(ids);
		for (const e of graph.edges) {
			expect(known.has(e.source) && known.has(e.target)).toBe(true);
		}
		const [q1, q2] = choice;
		// q1 shows three options, so q2 starts at least three rows lower.
		expect((q2?.position.y ?? 0) - (q1?.position.y ?? 0)).toBeGreaterThan(
			3 * 30,
		);
	});

	test("without choices the graph has only request nodes", () => {
		const plain = viewToGraph(view([node("prompt", "prompt", 0)], []));
		expect(plain.nodes.map((n) => n.type)).toEqual(["request"]);
	});
});
