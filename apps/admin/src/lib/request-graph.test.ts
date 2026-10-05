import { describe, expect, test } from "bun:test";
import type { RequestNode, RequestView } from "admin-api/types";
import { elapsedMs, viewToGraph } from "./request-graph.ts";

const detail = {
	text: null,
	intent: null,
	goal: null,
	tool: null,
	toolArgs: null,
	browserMs: null,
	expected: null,
	effects: null,
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
		userId: "u",
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
