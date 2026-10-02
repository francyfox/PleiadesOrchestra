import { describe, expect, test } from "bun:test";
import type { TraceEvent } from "../plan-runs/plan-runs.schema.ts";
import type { UpstreamRequestDetails } from "./requests.schema.ts";
import { buildRequestView } from "./requests.view.ts";

const T0 = 1_000_000;

let seq = 0;
const ev = (
	type: TraceEvent["type"],
	at: number,
	action: string | null,
	payload: Record<string, unknown> = {},
	attempt = 0,
): TraceEvent => ({ seq: seq++, type, attempt, action, payload, at });

const planned = (
	at: number,
	names: string[],
	state: Record<string, unknown> = {},
) =>
	ev("planned", at, null, {
		plan: names.map((name) => ({ name, cost: 3 })),
		totalCost: 3 * names.length,
		state,
	});
const started = (at: number, action: string) =>
	ev("action_started", at, action);
const finished = (
	at: number,
	action: string,
	expected: Record<string, unknown> = {},
	observed: Record<string, unknown> = expected,
) =>
	ev("action_finished", at, action, {
		durationMs: 1,
		expectedEffects: expected,
		observedEffects: observed,
	});
const waiting = (at: number, action: string, tool: string, args: object) =>
	ev("waiting", at, action, {
		waiting: { kind: "webmcp_tool_call", payload: { tool, arguments: args } },
		state: {},
	});

type Run = UpstreamRequestDetails["runs"][number];
const run = (
	id: string,
	createdAt: number,
	events: TraceEvent[],
	extra: Partial<Run> = {},
): Run => ({
	id,
	createdAt,
	durationMs: 100,
	succeeded: true,
	running: false,
	events,
	...extra,
});

function details(
	runs: Run[],
	options: {
		status?: UpstreamRequestDetails["request"]["status"];
		reply?: string | null;
		durationMs?: number;
		now?: number;
		calls?: UpstreamRequestDetails["llmCalls"];
	} = {},
): UpstreamRequestDetails {
	return {
		request: {
			id: runs[0]?.id ?? "r",
			userId: "u",
			threadId: "t",
			prompt: "купи 1 сыр",
			intent: "addToCart",
			status: options.status ?? "succeeded",
			goal: { replied: true },
			reply: options.reply ?? null,
			startedAt: T0,
			durationMs: options.durationMs ?? 5_000,
		},
		runs,
		llmCalls: options.calls ?? [],
		now: options.now ?? T0 + 60_000,
	};
}

const byLabel = (view: ReturnType<typeof buildRequestView>, label: string) =>
	view.nodes.find((node) => node.label === label);

describe("buildRequestView", () => {
	test("prompt → understanding → steps → result, each with its time", () => {
		const view = buildRequestView(
			details(
				[
					run("r1", T0, [
						planned(T0 + 400, ["generateReply"]),
						started(T0 + 410, "generateReply"),
						finished(T0 + 1_410, "generateReply", { replied: true }),
					]),
				],
				{ reply: "Привет!", durationMs: 1_500 },
			),
		);

		expect(view.nodes.map((n) => [n.kind, n.label, n.status])).toEqual([
			["prompt", "купи 1 сыр", "done"],
			["understand", "addToCart", "done"],
			["action", "generateReply", "done"],
			["result", "Привет!", "reached"],
		]);
		expect(view.nodes[1]).toMatchObject({ durationMs: 400 });
		expect(byLabel(view, "generateReply")).toMatchObject({
			startedAt: T0 + 410,
			durationMs: 1_000,
		});
		expect(view.nodes[3]?.durationMs).toBe(1_500);
		expect(view.edges.map((e) => [e.from, e.to, e.kind])).toEqual([
			["prompt", "understand", "next"],
			["understand", "1:generateReply", "next"],
			["1:generateReply", "result", "next"],
		]);
	});

	test("a browser tool is one step across two runs: arguments, the browser's own time, its answer", () => {
		const view = buildRequestView(
			details(
				[
					run("r1", T0, [
						planned(T0 + 100, ["search_products", "generateReply"], {}),
						started(T0 + 110, "search_products"),
						waiting(T0 + 1_100, "search_products", "search_products", {
							query: "cheese",
						}),
					]),
					run("r2", T0 + 1_600, [
						planned(T0 + 1_650, ["search_products", "generateReply"], {
							"webmcp:search_products:text": "- Brie — in stock",
						}),
						started(T0 + 1_660, "search_products"),
						finished(T0 + 1_670, "search_products", { catalogSearched: true }),
						started(T0 + 1_700, "generateReply"),
						finished(T0 + 2_700, "generateReply", { replied: true }),
					]),
				],
				{
					reply: "Нашёл Brie",
					calls: [
						{
							planRunId: "r1",
							actionName: "search_products",
							kind: "decision",
							provider: "delta",
							model: "qwen3-1.7b",
							inputTokens: 400,
							outputTokens: 7,
							latencyMs: 900,
							ok: true,
							error: null,
							at: T0 + 1_000,
						},
					],
				},
			),
		);

		const search = byLabel(view, "search_products");
		expect(search).toMatchObject({
			status: "done",
			startedAt: T0 + 110,
			// from the first run starting it to the second run finishing it
			durationMs: 1_560,
		});
		expect(search?.detail).toMatchObject({
			tool: "search_products",
			toolArgs: { query: "cheese" },
			// the server paused at +1100, the second run began at +1600
			browserMs: 500,
			text: "- Brie — in stock",
		});
		expect(search?.detail.calls).toEqual([
			{
				provider: "delta",
				model: "qwen3-1.7b",
				latencyMs: 900,
				inputTokens: 400,
				outputTokens: 7,
				ok: true,
				error: null,
			},
		]);
		expect(
			view.nodes.filter((n) => n.label === "search_products"),
		).toHaveLength(1);
	});

	test("while the browser works the step is highlighted and counts up; the plan's later steps are pending", () => {
		const view = buildRequestView(
			details(
				[
					run("r1", T0, [
						planned(T0 + 100, [
							"choose_store",
							"search_products",
							"generateReply",
						]),
						started(T0 + 110, "choose_store"),
						finished(T0 + 210, "choose_store", { storeOpen: true }),
						started(T0 + 220, "search_products"),
						waiting(T0 + 300, "search_products", "search_products", {
							query: "cheese",
						}),
					]),
				],
				{ status: "waiting", now: T0 + 2_220 },
			),
		);

		expect(byLabel(view, "choose_store")?.status).toBe("done");
		expect(byLabel(view, "search_products")).toMatchObject({
			status: "browser",
			durationMs: 2_000,
		});
		expect(byLabel(view, "search_products")?.detail.browserMs).toBeNull();
		expect(byLabel(view, "generateReply")).toMatchObject({
			status: "pending",
			startedAt: null,
			durationMs: null,
		});
		expect(view.nodes.at(-1)).toMatchObject({
			kind: "result",
			status: "pending",
		});
	});

	test("a step the server is executing is running, and the unreached plan is not_reached once the request ended", () => {
		const live = buildRequestView(
			details(
				[
					run(
						"r1",
						T0,
						[
							planned(T0 + 100, ["generateReply"]),
							started(T0 + 110, "generateReply"),
						],
						{ running: true },
					),
				],
				{ status: "running", now: T0 + 4_110 },
			),
		);
		expect(byLabel(live, "generateReply")).toMatchObject({
			status: "running",
			durationMs: 4_000,
		});

		const over = buildRequestView(
			details(
				[
					run(
						"r1",
						T0,
						[
							planned(T0 + 100, ["start_checkout", "generateReply"]),
							started(T0 + 110, "start_checkout"),
							finished(
								T0 + 120,
								"start_checkout",
								{ checkoutComplete: true },
								{ "toolResult:start_checkout": false },
							),
						],
						{ succeeded: false },
					),
				],
				{ status: "failed" },
			),
		);
		expect(byLabel(over, "start_checkout")?.status).toBe("failed");
		expect(byLabel(over, "generateReply")?.status).toBe("not_reached");
		expect(over.nodes.at(-1)).toMatchObject({
			kind: "result",
			status: "missed",
		});
	});

	test("before the first plan the request is still being understood", () => {
		const view = buildRequestView(
			details([run("r1", T0, [], { running: true })], {
				status: "running",
				now: T0 + 700,
			}),
		);
		expect(view.nodes.map((n) => [n.kind, n.status])).toEqual([
			["prompt", "done"],
			["understand", "running"],
			["result", "pending"],
		]);
		expect(view.nodes[1]?.durationMs).toBe(700);
	});

	test("a replan starts a new round, joined to the old one by a replan edge", () => {
		const view = buildRequestView(
			details(
				[
					run("r1", T0, [
						planned(T0 + 100, ["a", "generateReply"]),
						started(T0 + 110, "a"),
						finished(T0 + 120, "a", { x: true }, { x: false }),
						ev("replan", T0 + 125, null, { state: {} }),
						planned(T0 + 130, ["b", "generateReply"]),
						started(T0 + 140, "b"),
						finished(T0 + 150, "b", { y: true }),
					]),
				],
				{ status: "failed" },
			),
		);
		expect(byLabel(view, "a")).toMatchObject({ status: "diverged", round: 1 });
		expect(byLabel(view, "b")).toMatchObject({ status: "done", round: 2 });
		expect(view.edges.find((e) => e.kind === "replan")).toMatchObject({
			from: "1:a",
			to: "2:b",
		});
	});

	test("a failed or skipped action is shown with why", () => {
		const view = buildRequestView(
			details(
				[
					run(
						"r1",
						T0,
						[
							planned(T0 + 100, ["boom", "later"]),
							started(T0 + 110, "boom"),
							ev("action_failed", T0 + 130, "boom", {
								durationMs: 20,
								error: "model down",
							}),
							ev("action_skipped", T0 + 140, "later", {
								unmetPreconditions: { checkoutComplete: true },
							}),
						],
						{ succeeded: false },
					),
				],
				{ status: "failed" },
			),
		);
		expect(byLabel(view, "boom")).toMatchObject({
			status: "failed",
			durationMs: 20,
		});
		expect(byLabel(view, "boom")?.detail.error).toBe("model down");
		expect(byLabel(view, "later")).toMatchObject({ status: "skipped" });
		expect(byLabel(view, "later")?.detail.error).toContain("checkoutComplete");
	});
});
