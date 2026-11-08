import { describe, expect, test } from "bun:test";
import type {
	ActionContext,
	GoapAction,
	RunPlanResult,
	StreamingContext,
} from "@repo/core";
import {
	createRunLock,
	InMemoryWorldStateStore,
	reportingTrouble,
} from "@repo/core";
import { testDb } from "../database/database.testing.ts";
import {
	createToolErrorReplyAction,
	REPLY_ACTION,
} from "../goap/goap.service.ts";
import { startPlanRun } from "../plan-runs/plan-runs.service.ts";
import { RunBinding } from "../run-binding/run-binding.ts";
import { releaseWhenDone } from "../streaming/streaming.service.ts";
import { resolveThreadId } from "../threads/threads.service.ts";
import { upsertIdentifiedVisitor } from "../visitors/visitors.service.ts";
import {
	doneEvent,
	errorMessage,
	outcomeEvent,
	toolCallEvent,
} from "./run-stream.service.ts";
import { streamPlanRun } from "./run-stream.ts";

function result(overrides: Partial<RunPlanResult>): RunPlanResult {
	return {
		finalState: {},
		executedActions: [],
		succeeded: true,
		killed: false,
		...overrides,
	};
}

describe("doneEvent", () => {
	test("reads timing and token counts from the final state", () => {
		expect(
			doneEvent(
				{
					elapsedMs: 42,
					inputTokens: 3,
					outputTokens: 5,
					totalOutputTokens: 9,
				},
				1000,
			),
		).toEqual({
			type: "done",
			elapsedMs: 42,
			inputTokens: 3,
			outputTokens: 5,
			totalInputTokens: undefined,
			totalOutputTokens: 9,
		});
	});

	test("falls back to the measured time when the state has none", () => {
		expect(doneEvent({}, 77)).toMatchObject({ type: "done", elapsedMs: 77 });
	});

	test("ignores facts that are not numbers", () => {
		expect(
			doneEvent({ elapsedMs: "fast", inputTokens: true }, 5),
		).toMatchObject({
			elapsedMs: 5,
			inputTokens: undefined,
		});
	});
});

describe("toolCallEvent", () => {
	test("turns a WebMCP wait into a tool_call line with a fresh callId", () => {
		const waiting = {
			kind: "webmcp_tool_call",
			payload: { tool: "addToCart", arguments: { id: 1 } },
		};
		const first = toolCallEvent(waiting as never);
		const second = toolCallEvent(waiting as never);
		expect(first).toMatchObject({
			type: "tool_call",
			tool: "addToCart",
			arguments: { id: 1 },
		});
		expect(first).not.toEqual(second);
	});

	test("an unknown wait kind is reported as an error line", () => {
		expect(toolCallEvent({ kind: "mystery", payload: {} } as never)).toEqual({
			type: "error",
			message: "unsupported wait: mystery",
		});
	});
});

describe("outcomeEvent", () => {
	test("waiting wins over everything else", () => {
		const waiting = {
			kind: "webmcp_tool_call",
			payload: { tool: "t", arguments: {} },
		};
		expect(
			outcomeEvent(result({ succeeded: false, waiting: waiting as never }), 1)
				.type,
		).toBe("tool_call");
	});

	test("a failed run says why", () => {
		expect(outcomeEvent(result({ succeeded: false }), 1)).toEqual({
			type: "error",
			code: "task_failed",
			message: "no plan reached the goal",
		});
		expect(outcomeEvent(result({ succeeded: false, killed: true }), 1)).toEqual(
			{
				type: "error",
				message: "run cancelled",
			},
		);
	});

	test("a failed task carries what the site last answered, as the hint the visitor can act on", () => {
		const event = outcomeEvent(
			result({
				succeeded: false,
				finalState: {
					"webmcp:choose_store:text": "Opened Penny Pantry",
					"webmcp:search_products:text":
						'No products matched "french baget". Try a broader word, or browse the Bakery department.',
				},
			}),
			1,
		);
		expect(event).toEqual({
			type: "error",
			code: "task_failed",
			message: "no plan reached the goal",
			hint: 'No products matched "french baget". Try a broader word, or browse the Bakery department.',
		});
	});

	test("a tool error is told by its code's wording, never the site's text", () => {
		const hint = (text: string) => {
			const event = outcomeEvent(
				result({
					succeeded: false,
					finalState: {
						"page:lang": "en",
						product: "Desk Lamp",
						"webmcp:add_to_cart:result": "error",
						"webmcp:add_to_cart:text": text,
					},
				}),
				1,
			);
			return event.type === "error" ? event.hint : undefined;
		};
		expect(hint('{"error_code":"OUT_OF_STOCK"}')).toBe(
			"«Desk Lamp» is out of stock.",
		);
		expect(
			hint('{"error":"Product with ID \\"0\\" not found","status":400}'),
		).toBe(
			"That didn't work on the site. Please try again or put it in other words.",
		);
	});

	test("a long site answer is cut", () => {
		const event = outcomeEvent(
			result({
				succeeded: false,
				finalState: { "webmcp:search_products:text": "x".repeat(2000) },
			}),
			1,
		);
		expect(event.type === "error" && event.hint?.length).toBeLessThanOrEqual(
			400,
		);
	});

	test("a successful run ends with done", () => {
		expect(outcomeEvent(result({}), 9)).toMatchObject({
			type: "done",
			elapsedMs: 9,
		});
	});
});

describe("errorMessage", () => {
	test("uses the message of Errors and stringifies anything else", () => {
		expect(errorMessage(new Error("boom"))).toBe("boom");
		expect(errorMessage("plain")).toBe("plain");
	});
});

describe("a model server in trouble", () => {
	/** Streams one run whose preparation asks a model server that answers `statuses` in turn. */
	async function lines(statuses: number[], lang?: string) {
		const prepare = async () => {
			for (const status of statuses) {
				await reportingTrouble(
					(async () => new Response("", { status })) as unknown as typeof fetch,
				)("http://model");
			}
			return { state: {}, goal: {}, actions: [] };
		};
		const stream = streamPlanRun(
			{
				db: testDb(),
				runs: new RunBinding(),
				worldStateStore: new InMemoryWorldStateStore(),
				runLock: createRunLock(),
				now: Date.now,
			},
			{
				run: { planRunId: "r", threadId: "t" },
				signal: undefined,
				prepare,
				lang,
			},
		);
		const text = await new Response(stream).text();
		return text
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line))
			.filter((line) => line.type === "step");
	}

	test("the visitor is told once that the answer may take longer, then that it answers again", async () => {
		expect(await lines([429, 503, 200])).toEqual([
			{
				type: "step",
				id: "serverTrouble",
				phase: "running",
				text: "Сервер перегружен, повторяю запрос — ответ может занять больше времени…",
			},
			{
				type: "step",
				id: "serverTrouble",
				phase: "done",
				text: "Сервер снова отвечает",
			},
		]);
	});

	test("in the visitor's language; a server that never recovers is said to be down", async () => {
		expect(await lines([429], "en")).toEqual([
			expect.objectContaining({ phase: "running" }),
			{
				type: "step",
				id: "serverTrouble",
				phase: "failed",
				text: "The server is not answering",
			},
		]);
	});

	test("a healthy server says nothing", async () => {
		expect(await lines([200, 200])).toEqual([]);
	});
});

describe("a cancelled stream", () => {
	test("keeps its hold until the run it left behind has been debited", async () => {
		const order: string[] = [];
		let finishRun!: () => void;
		const running = new Promise<void>((resolve) => {
			finishRun = resolve;
		});
		// finishPlanRun needs the run row; without it persistRun would stop before the debit.
		const db = testDb();
		const visitor = upsertIdentifiedVisitor(
			db,
			"ch_telegram",
			"42",
			undefined,
			1,
		);
		const thread = resolveThreadId(db, "ch_telegram", visitor.id, "t1", 1);
		startPlanRun(db, {
			id: "r",
			visitorId: visitor.id,
			threadId: thread,
			goal: {},
			createdAt: 1,
		});
		const stream = releaseWhenDone(
			streamPlanRun(
				{
					db,
					runs: new RunBinding(),
					worldStateStore: new InMemoryWorldStateStore(),
					runLock: createRunLock(),
					now: Date.now,
					usageRecorder: { flush: () => order.push("debit") },
				},
				{
					run: { planRunId: "r", threadId: thread },
					signal: undefined,
					prepare: async () => {
						await running;
						return { state: {}, goal: {}, actions: [] };
					},
				},
			),
			() => order.push("release"),
		);
		const cancelled = stream.cancel();
		await Bun.sleep(5);
		// The client is gone but the model call is still going: its cost is not in the ledger yet.
		expect(order).toEqual([]);
		finishRun();
		await cancelled;
		expect(order).toEqual(["debit", "release"]);
	});
});

describe("a task that failed on a tool error", () => {
	const deltas = async (text: string) => {
		const modelReply: GoapAction = {
			name: REPLY_ACTION,
			cost: 5,
			preconditions: {},
			effects: { replied: true },
			async execute(ctx) {
				(ctx as ActionContext & StreamingContext).onDelta?.("MODEL");
				return { replied: true };
			},
		};
		const stream = streamPlanRun(
			{
				db: testDb(),
				runs: new RunBinding(),
				worldStateStore: new InMemoryWorldStateStore(),
				runLock: createRunLock(),
				now: Date.now,
			},
			{
				run: { planRunId: "r", threadId: "t" },
				signal: undefined,
				prepare: async () => ({
					state: {
						"page:lang": "en",
						product: "Desk Lamp",
						"webmcp:add_to_cart:result": "error",
						"webmcp:add_to_cart:text": text,
					},
					goal: { inCart: true },
					actions: [createToolErrorReplyAction(undefined), modelReply],
				}),
			},
		);
		return (await new Response(stream).text())
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line))
			.filter((line) => line.type === "delta")
			.map((line) => line.text);
	};

	test("is answered from the code's template, not by the model", async () => {
		expect(await deltas('{"error_code":"OUT_OF_STOCK"}')).toEqual([
			"«Desk Lamp» is out of stock.",
		]);
	});

	test("raw site text gives the UNKNOWN template", async () => {
		const [text] = await deltas('Product with ID "0" was not found');
		expect(text).not.toContain("not found");
		expect(text).toContain("didn't work");
	});
});
