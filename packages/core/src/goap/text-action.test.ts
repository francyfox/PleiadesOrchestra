import { describe, expect, test } from "bun:test";
import type { Agent, AgentStreamEvent, IncomingMessage } from "../types.ts";
import { createTextAction, type TextActionMeta } from "./text-action.ts";

function fakeAgent(
	events: AgentStreamEvent[],
): Agent & { capturedMessage?: IncomingMessage } {
	const agent: Agent & { capturedMessage?: IncomingMessage } = {
		async *handleMessageStream(message) {
			agent.capturedMessage = message;
			for (const event of events) yield event;
		},
		async resetThread() {},
	};
	return agent;
}

describe("createTextAction", () => {
	test("concatenates delta events into the reply text and maps it through toEffects", async () => {
		const agent = fakeAgent([
			{
				type: "progress",
				chunkIndex: 0,
				totalChunks: 1,
				elapsedMs: 0,
				contextChars: 0,
			},
			{ type: "delta", text: "Hello, " },
			{ type: "delta", text: "world." },
			{ type: "done", elapsedMs: 10, inputTokens: 5, outputTokens: 3 },
		]);

		const action = createTextAction({
			name: "generateReply",
			cost: 5,
			preconditions: { intent: "buy" },
			effects: { replied: true },
			agent,
			toChunks: (state) => [String(state.userMessage)],
			threadId: (state) => String(state.threadId),
			userId: (state) => String(state.userId),
			toEffects: (replyText) => ({ replied: true, replyText }),
		});

		const effects = await action.execute({
			state: { userMessage: "hi", threadId: "t1", userId: "u1" },
		});

		expect(effects).toEqual({ replied: true, replyText: "Hello, world." });
	});

	test("builds the IncomingMessage from live world state via threadId/userId/toChunks", async () => {
		const agent = fakeAgent([{ type: "done", elapsedMs: 1 }]);

		const action = createTextAction({
			name: "generateReply",
			cost: 5,
			preconditions: {},
			effects: { replied: true },
			agent,
			toChunks: (state) => [String(state.userMessage)],
			threadId: (state) => String(state.threadId),
			userId: (state) => String(state.userId),
			toEffects: () => ({ replied: true }),
		});

		await action.execute({
			state: {
				userMessage: "hi there",
				threadId: "thread-1",
				userId: "user-1",
			},
		});

		expect(agent.capturedMessage).toEqual({
			threadId: "thread-1",
			userId: "user-1",
			actionName: "generateReply",
			chunks: ["hi there"],
		});
	});

	test("threads state.planRunId into the IncomingMessage when it's a string", async () => {
		const agent = fakeAgent([{ type: "done", elapsedMs: 1 }]);

		const action = createTextAction({
			name: "generateReply",
			cost: 5,
			preconditions: {},
			effects: { replied: true },
			agent,
			toChunks: () => ["hi"],
			threadId: () => "t1",
			userId: () => "u1",
			toEffects: () => ({ replied: true }),
		});

		await action.execute({ state: { planRunId: "run-1" } });
		expect(agent.capturedMessage?.planRunId).toBe("run-1");

		await action.execute({ state: { planRunId: 42 } });
		expect(agent.capturedMessage?.planRunId).toBeUndefined();
	});

	test("forwards each delta live via ctx.onDelta as it streams, not just the joined result", async () => {
		const agent = fakeAgent([
			{ type: "delta", text: "Hel" },
			{ type: "delta", text: "lo" },
			{ type: "done", elapsedMs: 1 },
		]);
		const seen: string[] = [];

		const action = createTextAction({
			name: "generateReply",
			cost: 5,
			preconditions: {},
			effects: { replied: true },
			agent,
			toChunks: (state) => [String(state.userMessage)],
			threadId: (state) => String(state.threadId),
			userId: (state) => String(state.userId),
			toEffects: (replyText) => ({ replied: true, replyText }),
		});

		await action.execute({
			state: { userMessage: "hi", threadId: "t1", userId: "u1" },
			onDelta: (text: string) => seen.push(text),
		});

		expect(seen).toEqual(["Hel", "lo"]);
	});

	test("passes the underlying agent call's timing, usage and usage totals to toEffects", async () => {
		const agent = fakeAgent([
			{ type: "delta", text: "hi" },
			{
				type: "done",
				elapsedMs: 42,
				inputTokens: 7,
				outputTokens: 3,
				totalInputTokens: 19,
				totalOutputTokens: 5,
			},
		]);

		let capturedMeta: TextActionMeta | undefined;

		const action = createTextAction({
			name: "generateReply",
			cost: 5,
			preconditions: {},
			effects: { replied: true },
			agent,
			toChunks: (state) => [String(state.userMessage)],
			threadId: (state) => String(state.threadId),
			userId: (state) => String(state.userId),
			toEffects: (replyText, meta) => {
				capturedMeta = meta;
				return { replied: true, replyText };
			},
		});

		await action.execute({
			state: { userMessage: "hi", threadId: "t1", userId: "u1" },
		});

		expect(capturedMeta).toEqual({
			elapsedMs: 42,
			inputTokens: 7,
			outputTokens: 3,
			totalInputTokens: 19,
			totalOutputTokens: 5,
		});
	});

	test("carries the static name/cost/preconditions/effects through unchanged", () => {
		const agent = fakeAgent([]);
		const preconditions = { intent: "buy" };
		const effects = { replied: true };

		const action = createTextAction({
			name: "generateReply",
			cost: 5,
			preconditions,
			effects,
			agent,
			toChunks: (state) => [String(state.userMessage)],
			threadId: (state) => String(state.threadId),
			userId: (state) => String(state.userId),
			toEffects: () => ({}),
		});

		expect(action.name).toBe("generateReply");
		expect(action.cost).toBe(5);
		expect(action.preconditions).toBe(preconditions);
		expect(action.effects).toBe(effects);
	});
});
