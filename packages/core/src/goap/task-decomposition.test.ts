import { describe, expect, test } from "bun:test";
import { SHOP_TAXONOMY } from "@repo/intent-presets";
import type { FunctionCallAgent } from "#core/function-call-agent";
import { createFunctionCallAgent } from "#core/function-call-agent";
import {
	decomposeMessage,
	hasOrderWord,
	looksLikeSeveralTasks,
	mustAskOrder,
	runnableTasks,
} from "#core/goap/task-decomposition";
import type { GoapAction } from "#core/goap/types";

const INTENTS = {
	search: "look for things",
	addToCart: "buy",
	clear: "empty the cart",
	other: "anything else",
};

const fake = (answer: unknown): FunctionCallAgent => ({
	fillArguments: async () => answer as Record<string, unknown>,
});

test("valid multi-task answer comes back as is", async () => {
	const tasks = [
		{ intent: "search", text: "cheese" },
		{ intent: "addToCart", text: "milk" },
		{ intent: "clear", text: "empty it", after: 1 },
	];
	expect(await decomposeMessage(fake({ tasks }), INTENTS, "x")).toEqual(tasks);
});

test("one task", async () => {
	const tasks = [{ intent: "search", text: "laptop" }];
	expect(await decomposeMessage(fake({ tasks }), INTENTS, "x")).toEqual(tasks);
});

test("intent outside the taxonomy is dropped", async () => {
	expect(
		await decomposeMessage(fake({ tasks: [{ intent: "fly" }] }), INTENTS, "x"),
	).toBeUndefined();
});

test("an after that is not an earlier index is dropped, a valid one kept", async () => {
	for (const after of [0, 1, 5, -1, 0.5]) {
		const tasks = [
			{ intent: "search", text: "a" },
			{ intent: "clear", text: "b", after },
		];
		const got = await decomposeMessage(fake({ tasks }), INTENTS, "x");
		expect(got?.[1]?.after).toBe(after === 0 ? 0 : undefined);
	}
});

test("no tasks, or an agent that throws, gives undefined", async () => {
	expect(
		await decomposeMessage(fake({ tasks: [] }), INTENTS, "x"),
	).toBeUndefined();
	const broken: FunctionCallAgent = {
		fillArguments: async () => {
			throw new Error("unusable");
		},
	};
	expect(await decomposeMessage(broken, INTENTS, "x")).toBeUndefined();
});

test("a slightly broken answer is repaired by the real agent path", async () => {
	const bodies: string[] = [];
	const agent = createFunctionCallAgent({
		baseURL: "http://localhost/v1",
		apiKey: "k",
		model: "m",
		telemetry: { logLlmState() {}, logMessageEvent() {} } as never,
		fetchImpl: (async () => {
			bodies.push("call");
			// fenced, trailing comma, "0" as a string
			const content =
				'```json\n{"tasks":[{"intent":"search","text":"find cheese"},{"intent":"addToCart","text":"buy it","after":"0",},]}\n```';
			return new Response(
				JSON.stringify({ choices: [{ message: { content } }] }),
				{ headers: { "content-type": "application/json" } },
			);
		}) as unknown as typeof fetch,
	});
	expect(
		await decomposeMessage(agent, INTENTS, "find cheese then buy it"),
	).toEqual([
		{ intent: "search", text: "find cheese" },
		{ intent: "addToCart", text: "buy it", after: 0 },
	]);
	expect(bodies).toHaveLength(1);
});

test("several tasks without their own words are unusable, one task needs none", async () => {
	expect(
		await decomposeMessage(
			fake({ tasks: [{ intent: "search" }, { intent: "clear", text: "x" }] }),
			INTENTS,
			"x",
		),
	).toBeUndefined();
	expect(
		await decomposeMessage(
			fake({ tasks: [{ intent: "search" }] }),
			INTENTS,
			"x",
		),
	).toEqual([{ intent: "search" }]);
});

test("the cue gate reads language cues, not products", () => {
	for (const yes of [
		"find a lamp and a desk",
		"book a table, then a taxi",
		"show shoes also",
		"open orders; find a hat",
	])
		expect(looksLikeSeveralTasks(yes)).toBe(true);
	expect(looksLikeSeveralTasks("find a gluten free bread")).toBe(false);
	expect(hasOrderWord("add a lamp and then clear the cart")).toBe(true);
	expect(hasOrderWord("add a lamp and clear the cart")).toBe(false);
});

const producing = (...effects: Record<string, boolean>[]): GoapAction[] =>
	effects.map((effect, i) => ({
		name: `tool${i}`,
		cost: 1,
		preconditions: {},
		effects: effect,
		execute: async () => ({}),
	}));

describe("runnableTasks", () => {
	const actions = producing(
		{ catalogSearched: true },
		{ inCart: true },
		{ inCart: false },
	);

	test("checkout or removal not confirmed by the words is dropped", () => {
		const tasks = [
			{ intent: "addToCart", text: "add a kettle" },
			{ intent: "removeFromCart", text: "add a kettle" },
			{ intent: "removeFromCart", text: "remove the toaster" },
		];
		expect(
			runnableTasks(tasks, SHOP_TAXONOMY, actions).map((t) => t.text),
		).toEqual(["add a kettle", "remove the toaster"]);
	});

	test("a task no action of the site can do is dropped", () => {
		const tasks = [
			{ intent: "search", text: "find a lamp" },
			{ intent: "select", text: "find a lamp" },
			{ intent: "other", text: "thanks" },
		];
		expect(runnableTasks(tasks, SHOP_TAXONOMY, actions)).toEqual(
			tasks.slice(0, 1),
		);
	});

	test("a select right after a search of the same words is dropped even when a tool selects", () => {
		const withSelect = producing(
			{ catalogSearched: true },
			{ itemSelected: true },
		);
		const tasks = [
			{ intent: "search", text: "Find a lamp" },
			{ intent: "select", text: "find a lamp." },
			{ intent: "select", text: "the second one" },
		];
		expect(
			runnableTasks(tasks, SHOP_TAXONOMY, withSelect).map((t) => t.text),
		).toEqual(["Find a lamp", "the second one"]);
	});
});

describe("mustAskOrder", () => {
	const add = { intent: "addToCart", text: "add a kettle" };
	const clear = { intent: "removeFromCart", text: "empty my cart" };
	const pay = { intent: "checkout", text: "pay" };

	test("add and empty the cart without an order word", () => {
		expect(
			mustAskOrder(
				SHOP_TAXONOMY,
				[add, clear],
				"add a kettle and empty my cart",
			),
		).toBe(true);
		expect(
			mustAskOrder(
				SHOP_TAXONOMY,
				[add, clear],
				"add a kettle, then empty my cart",
			),
		).toBe(false);
	});

	test("checkout must come last", () => {
		expect(
			mustAskOrder(SHOP_TAXONOMY, [pay, add], "pay and add a kettle"),
		).toBe(true);
		expect(
			mustAskOrder(SHOP_TAXONOMY, [add, pay], "add a kettle and pay"),
		).toBe(false);
	});
});
