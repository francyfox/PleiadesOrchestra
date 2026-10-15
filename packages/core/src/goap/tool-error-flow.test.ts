import { describe, expect, test } from "bun:test";
import type { DecisionAgent, DecisionAnswer } from "../decision-types.ts";
import { runPlan } from "./executor.ts";
import type { WorldState } from "./types.ts";
import {
	createWebMcpActions,
	type WebMcpToolCallPayload,
	type WebMcpToolDescriptor,
} from "./webmcp-actions.ts";

const choice = (value: string): DecisionAnswer => ({
	type: "choice",
	choice: value,
	probabilities: { [value]: 1 },
});

const enumTool = (
	name: string,
	parameter: string,
	values: string[],
): WebMcpToolDescriptor => ({
	name,
	description: `Pick the ${parameter}.`,
	inputSchema: {
		type: "object",
		properties: { [parameter]: { type: "string", enum: values } },
		required: [parameter],
	} as WebMcpToolDescriptor["inputSchema"],
});

const plainTool = (name: string): WebMcpToolDescriptor => ({
	name,
	description: "Does the thing.",
	inputSchema: { type: "object", properties: { what: { type: "string" } } },
});

/** Answers every browser call from `answers[tool]` (consumed in order, last one repeats). */
async function run(
	tools: WebMcpToolDescriptor[],
	intents: Record<string, string>,
	answers: Record<string, { error?: boolean; text: string }[]>,
	start: WorldState,
) {
	const laya: DecisionAgent = {
		async decide(state, questions) {
			const name = (state as { name?: string }).name;
			const out: Record<string, DecisionAnswer> = {};
			for (const key of Object.keys(questions)) {
				out[key] = choice(
					key === "intent" ? (intents[name ?? ""] ?? "other") : "B",
				);
			}
			return out;
		},
	};
	const actions = await createWebMcpActions({ tools, decisionAgent: laya });
	let state = start;
	const calls: WebMcpToolCallPayload[] = [];
	const used: Record<string, number> = {};
	for (let turn = 0; turn < 12; turn++) {
		const result = await runPlan({
			state,
			goal: { inCart: true },
			actions,
			ctx: {},
			maxActionFailures: 2,
		});
		state = result.finalState;
		if (!result.waiting) return { calls, state, succeeded: result.succeeded };
		const payload = result.waiting.payload as WebMcpToolCallPayload;
		calls.push(payload);
		const list = answers[payload.tool] ?? [{ text: "done" }];
		const answer = list[Math.min(used[payload.tool] ?? 0, list.length - 1)];
		used[payload.tool] = (used[payload.tool] ?? 0) + 1;
		state = {
			...state,
			[`webmcp:${payload.tool}:result`]: answer?.error ? "error" : "ok",
			[`webmcp:${payload.tool}:text`]: answer?.text,
		};
	}
	throw new Error("did not settle");
}

const STALE: WorldState = {
	userMessage: "add the tomato soup recipe",
	requestParsed: true,
	catalogSearched: true,
	storeOpen: true,
};

describe("a tool error that names the missing step", () => {
	test("the named tool runs, then the failed call is repeated", async () => {
		const { calls, succeeded } = await run(
			[
				enumTool("choose_store", "store", ["A", "B", "C"]),
				plainTool("add_recipe_to_cart"),
			],
			{ choose_store: "chooseStore", add_recipe_to_cart: "addToCart" },
			{
				add_recipe_to_cart: [
					{
						error: true,
						text: "No store is open yet. Call choose_store first with one of: A, B, C.",
					},
					{ text: "added" },
				],
			},
			STALE,
		);
		expect(calls.map((call) => call.tool)).toEqual([
			"add_recipe_to_cart",
			"choose_store",
			"add_recipe_to_cart",
		]);
		expect(calls[1]?.arguments).toEqual({ store: "B" });
		expect(succeeded).toBe(true);
	});

	test("a booking site: select_city first, then the booking again", async () => {
		const { calls, succeeded } = await run(
			[enumTool("select_city", "city", ["A", "B"]), plainTool("book_table")],
			{ select_city: "chooseStore", book_table: "addToCart" },
			{
				book_table: [
					{ error: true, text: "Unknown city. Call select_city first." },
					{ text: "booked" },
				],
			},
			{ ...STALE, userMessage: "book a table for two" },
		);
		expect(calls.map((call) => call.tool)).toEqual([
			"book_table",
			"select_city",
			"book_table",
		]);
		expect(succeeded).toBe(true);
	});

	test("the same error after the recovery ends the run instead of looping", async () => {
		const error = {
			error: true,
			text: "No store is open yet. Call choose_store first.",
		};
		const { calls, succeeded } = await run(
			[
				enumTool("choose_store", "store", ["A", "B"]),
				plainTool("add_recipe_to_cart"),
			],
			{ choose_store: "chooseStore", add_recipe_to_cart: "addToCart" },
			{ add_recipe_to_cart: [error] },
			STALE,
		);
		expect(succeeded).toBe(false);
		expect(calls.map((call) => call.tool)).toEqual([
			"add_recipe_to_cart",
			"choose_store",
			"add_recipe_to_cart",
		]);
	});

	test("an error that names no tool fails as before", async () => {
		const { calls, succeeded } = await run(
			[
				enumTool("choose_store", "store", ["A", "B"]),
				plainTool("add_recipe_to_cart"),
			],
			{ choose_store: "chooseStore", add_recipe_to_cart: "addToCart" },
			{ add_recipe_to_cart: [{ error: true, text: "Recipe not found." }] },
			STALE,
		);
		expect(succeeded).toBe(false);
		expect(calls.map((call) => call.tool)).toEqual(["add_recipe_to_cart"]);
	});
});
