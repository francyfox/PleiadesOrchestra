import { describe, expect, test } from "bun:test";
import type { RunPlanResult } from "@repo/core";
import {
	doneEvent,
	errorMessage,
	outcomeEvent,
	toolCallEvent,
} from "./run-stream.service.ts";

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
