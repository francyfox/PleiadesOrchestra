import { describe, expect, test } from "bun:test";
import type { GoapAction } from "@repo/core";
import { InMemoryWorldStateStore } from "@repo/core";
import { REPLY_ACTION } from "../goap/goap.service.ts";
import {
	prepareResume,
	replyAfterTask,
	toolResultText,
} from "./reply.service.ts";
import type { ReplyDeps } from "./reply.types.ts";

const action = (name: string): GoapAction => ({
	name,
	cost: 1,
	preconditions: {},
	effects: {},
	execute: async () => ({}),
});

describe("toolResultText", () => {
	test("joins the text parts of an MCP-shaped answer", () => {
		expect(
			toolResultText({
				content: [
					{ type: "text", text: "line 1" },
					{ type: "image" },
					{ type: "text", text: "line 2" },
				],
			}),
		).toBe("line 1\nline 2");
	});

	test("takes a plain string as it is and JSON-encodes anything else", () => {
		expect(toolResultText("hello")).toBe("hello");
		expect(toolResultText({ ok: true })).toBe('{"ok":true}');
		expect(toolResultText(undefined)).toBe("");
	});

	test("is capped, so a huge page can't fill the world state", () => {
		expect(toolResultText("x".repeat(100_000)).length).toBeLessThanOrEqual(
			4000,
		);
	});
});

describe("replyAfterTask", () => {
	test("the reply waits for the task's own goal facts, nothing else changes", () => {
		const [reply, other] = replyAfterTask(
			[action(REPLY_ACTION), action("search")],
			{ replied: true, inCart: true },
		);
		expect(reply?.preconditions).toEqual({ inCart: true });
		expect(other?.preconditions).toEqual({});
	});

	test("a plain chat goal leaves the actions as they are", () => {
		const actions = [action(REPLY_ACTION)];
		expect(replyAfterTask(actions, { replied: true })).toBe(actions);
	});
});

describe("prepareResume", () => {
	async function deps(state: Record<string, string | boolean>) {
		const worldStateStore = new InMemoryWorldStateStore();
		await worldStateStore.save("t1", { state, goal: { inCart: true } });
		return {
			worldStateStore,
			webmcpCatalog: new Map(),
			actions: [],
		} as unknown as ReplyDeps;
	}

	test("puts the tool's outcome and its answer text into the state, keeps the goal", async () => {
		const prepared = await prepareResume(
			await deps({ query: "cheese" }),
			"t1",
			"run-2",
			{
				tool: "search_products",
				isError: false,
				result: { content: [{ type: "text", text: "- Swiss Cheese — $4" }] },
			},
		);
		expect(prepared.goal).toEqual({ inCart: true });
		expect(prepared.state).toMatchObject({
			query: "cheese",
			planRunId: "run-2",
			"webmcp:search_products:result": "ok",
			"webmcp:search_products:text": "- Swiss Cheese — $4",
		});
	});

	test("an error result is recorded as such", async () => {
		const prepared = await prepareResume(await deps({}), "t1", "r", {
			tool: "add_to_cart",
			isError: true,
		});
		expect(prepared.state["webmcp:add_to_cart:result"]).toBe("error");
	});

	test("nothing to resume is an error", async () => {
		const empty = {
			worldStateStore: new InMemoryWorldStateStore(),
			webmcpCatalog: new Map(),
			actions: [],
		} as unknown as ReplyDeps;
		expect(
			prepareResume(empty, "t1", "r", { tool: "x", isError: false }),
		).rejects.toThrow("nothing to resume");
	});
});
