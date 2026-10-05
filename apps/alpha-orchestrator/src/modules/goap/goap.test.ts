import { describe, expect, test } from "bun:test";
import type { GoapAction, HistoryStore } from "@repo/core";
import { plan } from "@repo/core";
import {
	buildActions,
	createTemplateReplyAction,
	customerFacts,
	REPLY_ACTION,
	replyChunks,
	TEMPLATE_REPLY_ACTION,
} from "./goap.service.ts";

describe("customerFacts", () => {
	test("prefixes every key so it can't collide with bookkeeping facts", () => {
		expect(customerFacts({ city: "Almaty", vip: true, floor: 3 })).toEqual({
			"customer:city": "Almaty",
			"customer:vip": true,
			"customer:floor": 3,
		});
	});

	test("no context means no facts", () => {
		expect(customerFacts(undefined)).toEqual({});
	});
});

describe("replyChunks", () => {
	test("a plain message is split into chunks as before", () => {
		expect(replyChunks({ userMessage: "привет" }, 100)).toEqual(["привет"]);
	});

	test("after an item went into the cart the reply is told what was done", () => {
		const [chunk] = replyChunks(
			{
				userMessage: "купи 1 сыр",
				inCart: true,
				product: "Swiss Cheese",
				quantity: 1,
				store: "Penny Pantry",
			},
			1000,
		);
		expect(chunk).toContain("купи 1 сыр");
		expect(chunk).toContain("1 × Swiss Cheese");
		expect(chunk).toContain("Penny Pantry");
		// A small model once answered «купи яблоко» with "as an AI I can't buy":
		// the prompt says it is already done.
		expect(chunk).toMatch(/уже/);
	});

	const SEARCH_ANSWER =
		'Showing 2 of 2 results at Penny Pantry for "apple":\n- Honeycrisp Apples — $1.28\n- Granny Smith Apples — $0.85';

	test("after a search the reply is given what the site found, not only the question", () => {
		const [chunk] = replyChunks(
			{
				userMessage: "найди яблоко",
				messageIntent: "search",
				"webmcp:search_products:result": "ok",
				"webmcp:search_products:text": SEARCH_ANSWER,
			},
			1000,
		);
		expect(chunk).toContain("найди яблоко");
		expect(chunk).toContain("Honeycrisp Apples");
		expect(chunk).toContain("Granny Smith Apples");
	});

	test("the newest tool answer is the one given, and a long one is cut", () => {
		const [chunk] = replyChunks(
			{
				userMessage: "что есть?",
				messageIntent: "search",
				"webmcp:choose_store:text": "Opened Penny Pantry",
				"webmcp:search_products:text": `first ${"x".repeat(5000)}`,
			},
			1000,
		);
		expect(chunk).toContain("first");
		expect(chunk).not.toContain("Opened Penny Pantry");
		expect(chunk?.length).toBeLessThan(1500);
	});

	test("a plain chat message never picks up a tool answer", () => {
		expect(
			replyChunks(
				{
					userMessage: "привет",
					messageIntent: "chat",
					"webmcp:search_products:text": SEARCH_ANSWER,
				},
				100,
			),
		).toEqual(["привет"]);
	});

	test("a tool that failed is reported to the reply, so it says so instead of claiming it can't shop", () => {
		const [chunk] = replyChunks(
			{
				userMessage: "купи яблоко",
				messageIntent: "addToCart",
				"toolResult:add_to_cart": false,
			},
			1000,
		);
		expect(chunk).toContain("купи яблоко");
		expect(chunk).toContain("add_to_cart");
		expect(chunk).toMatch(/не удалось/i);
	});

	test("a failed task is told together with what the site answered, so the reply can pass its advice on", () => {
		const [chunk] = replyChunks(
			{
				userMessage: "купи французский багет",
				messageIntent: "addToCart",
				"toolResult:search_products": false,
				"webmcp:search_products:text":
					'No products matched "french baget". Try a broader word.',
			},
			1000,
		);
		expect(chunk).toContain("купи французский багет");
		expect(chunk).toContain('No products matched "french baget"');
		expect(chunk).toMatch(/совет/i);
	});
});

describe("the templated reply after a finished purchase", () => {
	const bought = {
		userMessage: "купи 1 яблоко",
		inCart: true,
		product: "Honeycrisp Apples",
		quantity: 1,
		store: "Penny Pantry",
		threadId: "t1",
		userId: "u1",
		planRunId: "r1",
	};

	function fakeHistory() {
		const writes: { ctx: unknown; messages: unknown[] }[] = [];
		const history: HistoryStore = {
			async get() {
				return [];
			},
			async append(ctx, messages) {
				writes.push({ ctx, messages });
			},
			async reset() {},
		};
		return { history, writes };
	}

	test("it says what was done in the user's language, streams it, and needs no model", async () => {
		const { history } = fakeHistory();
		const action = createTemplateReplyAction(history);
		const streamed: string[] = [];

		const effects = await action.execute({
			state: bought,
			onDelta: (text: string) => streamed.push(text),
		} as never);

		expect(effects).toMatchObject({ replied: true });
		expect(String((effects as Record<string, unknown>).replyText)).toBe(
			"Добавил в корзину: 1 × Honeycrisp Apples (Penny Pantry).",
		);
		expect(streamed.join("")).toBe(
			(effects as Record<string, unknown>).replyText as string,
		);
	});

	test("an English message, or a page in English, gets an English reply", async () => {
		const action = createTemplateReplyAction(undefined);
		const english = await action.execute({
			state: { ...bought, userMessage: "buy 2 apples", quantity: 2 },
		} as never);
		expect((english as Record<string, unknown>).replyText).toBe(
			"Added to your cart: 2 × Honeycrisp Apples (Penny Pantry).",
		);
		const byPage = await action.execute({
			state: { ...bought, "page:lang": "en" },
		} as never);
		expect(String((byPage as Record<string, unknown>).replyText)).toStartWith(
			"Added to your cart",
		);
	});

	test("the exchange is stored like a model's reply would be", async () => {
		const { history, writes } = fakeHistory();
		await createTemplateReplyAction(history).execute({
			state: bought,
		} as never);

		expect(writes).toHaveLength(1);
		expect(writes[0]?.ctx).toMatchObject({
			threadId: "t1",
			userId: "u1",
			planRunId: "r1",
			actionName: TEMPLATE_REPLY_ACTION,
		});
		expect(writes[0]?.messages).toEqual([
			{ role: "user", content: "купи 1 яблоко" },
			{
				role: "assistant",
				content: "Добавил в корзину: 1 × Honeycrisp Apples (Penny Pantry).",
			},
		]);
	});

	test("the template stores the user's own text, not the normalized one", async () => {
		const { history, writes } = fakeHistory();
		await createTemplateReplyAction(history).execute({
			state: { ...bought, userMessageRaw: "купи\n1 яблоко" },
		} as never);
		expect(writes[0]?.messages[0]).toEqual({
			role: "user",
			content: "купи\n1 яблоко",
		});
	});

	test("it only applies once the item is in the cart, for a message classified as a purchase", () => {
		const action = createTemplateReplyAction(undefined);
		expect(action.preconditions).toEqual({
			inCart: true,
			messageIntent: "addToCart",
		});
		expect(action.effects).toEqual({ replied: true });
	});

	const fakeAgent = {
		async *handleMessageStream() {},
		async resetThread() {},
	};
	const addToCart: GoapAction = {
		name: "add_to_cart",
		cost: 3,
		preconditions: {},
		effects: { inCart: true },
		execute: async () => ({ inCart: true }),
	};

	test("the planner takes it for a purchase (cheaper than the model) and leaves a plain chat to the model", () => {
		const catalog = [...buildActions(fakeAgent, 100), addToCart];

		const purchase = plan(
			{ messageIntent: "addToCart" },
			{ replied: true, inCart: true },
			catalog,
		);
		expect(purchase?.map((a) => a.name)).toEqual([
			"add_to_cart",
			TEMPLATE_REPLY_ACTION,
		]);

		// Even when a cheap chain of tools could produce `inCart`, a chat stays a chat.
		const chat = plan({ messageIntent: "chat" }, { replied: true }, catalog);
		expect(chat?.map((a) => a.name)).toEqual([REPLY_ACTION]);
		const unclassified = plan({}, { replied: true }, catalog);
		expect(unclassified?.map((a) => a.name)).toEqual([REPLY_ACTION]);
	});
});
