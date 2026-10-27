import { describe, expect, test } from "bun:test";
import type { Agent, GoapAction, HistoryStore } from "@repo/core";
import { plan } from "@repo/core";
import {
	buildActions,
	createRemovalReplyAction,
	createTemplateReplyAction,
	customerFacts,
	REMOVAL_REPLY_ACTION,
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

	test("replyTo is passed to the reply model as the message the visitor answers", () => {
		const [chunk] = replyChunks(
			{ userMessage: "2", replyTo: "1. Add A\n2. Add B" },
			1000,
		);
		expect(chunk).toContain("«1. Add A\n2. Add B»");
		expect(chunk).toContain('"2"');
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
		expect(chunk).toMatch(/already done/);
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
		expect(chunk).toMatch(/failed/i);
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
		expect(chunk).toMatch(/advice/i);
	});
});

describe("the language of the reply", () => {
	const note = {
		userMessage: "find an apple",
		messageIntent: "search",
		"webmcp:s:text": "ok",
	};
	const last = (state: Record<string, unknown>) =>
		replyChunks({ ...note, ...state }, 1000)[0]
			?.split(". ")
			.at(-1);

	test("wrappers are English and quote the original message", () => {
		const [chunk] = replyChunks({ ...note, userMessage: "найди яблоко" }, 1000);
		expect(chunk).toStartWith('The visitor wrote: "найди яблоко".');
	});

	test("without a fixed language the model is told to follow the quoted message", () => {
		expect(last({ "page:lang": "ru" })).toBe(
			"Answer in the language of the visitor's message quoted above.",
		);
	});

	test("a language picked in the widget wins over the message", () => {
		expect(last({ "page:lang": "ru", "ui:langChosen": true })).toBe(
			"Answer in Russian.",
		);
		expect(last({ "page:lang": "kk", "ui:langChosen": true })).toBe(
			"Answer in Kazakh.",
		);
	});

	test("the channel persona's language wins over the pick", () => {
		expect(
			last({ "persona:lang": "en", "page:lang": "ru", "ui:langChosen": true }),
		).toBe("Answer in English.");
	});

	test("a queue quotes the original message and ends with the same line", () => {
		const [chunk] = replyChunks(
			{
				...note,
				userMessage: "add milk and show the cart",
				"ui:langChosen": true,
				"page:lang": "ru",
				taskOutcomes: JSON.stringify([
					{ intent: "addToCart", text: "add milk", ok: true },
				]),
			},
			1000,
		);
		expect(chunk).toContain('"add milk and show the cart"');
		expect(chunk).toEndWith("Answer in Russian.");
	});

	test("a template reply follows the message's script unless a language is fixed", async () => {
		const action = createTemplateReplyAction(undefined);
		const say = async (extra: Record<string, unknown>) =>
			(
				(await action.execute({
					state: {
						inCart: true,
						product: "Milk",
						messageIntent: "addToCart",
						...extra,
					},
				} as never)) as Record<string, unknown>
			).replyText;
		expect(await say({ userMessage: "buy milk", "page:lang": "ru" })).toBe(
			"Added to your cart: 1 × Milk.",
		);
		expect(await say({ userMessage: "купи молоко", "page:lang": "en" })).toBe(
			"Добавил в корзину: 1 × Milk.",
		);
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
			state: { ...bought, "ui:langChosen": true, "page:lang": "en" },
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

describe("reply action and the channel's persona", () => {
	function captureAgent() {
		const seen: (string | undefined)[] = [];
		const agent: Agent = {
			async *handleMessageStream(message) {
				seen.push(message.systemPrompt);
				yield { type: "done", elapsedMs: 1 };
			},
			async resetThread() {},
		};
		return { agent, seen };
	}

	test("the reply is generated with the prompt of the channel in the state", async () => {
		const { agent, seen } = captureAgent();
		const reply = buildActions(agent, 100, undefined, (channelId) =>
			channelId === "ch_a" ? "persona A" : undefined,
		).find((a) => a.name === REPLY_ACTION);
		await reply?.execute({ state: { userMessage: "hi", channelId: "ch_a" } });
		await reply?.execute({ state: { userMessage: "hi", channelId: "ch_b" } });
		await reply?.execute({ state: { userMessage: "hi" } });
		expect(seen).toEqual(["persona A", undefined, undefined]);
	});
});

describe("a purchase of several things", () => {
	const found = JSON.stringify([
		{ name: "Keychron K2 Keyboard", quantity: 1 },
		{ name: "Braided HDMI Cable 2m", quantity: 3 },
	]);
	const missing = JSON.stringify([{ name: "quantum toaster", quantity: 1 }]);
	const state = {
		inCart: true,
		messageIntent: "addToCart",
		userMessage: "x",
		foundItems: found,
		product: "Keychron K2 Keyboard",
		quantity: 1,
	};

	test("the template lists everything added, in the page's language", async () => {
		const action = createTemplateReplyAction(undefined);
		const en = await action.execute({
			state: { ...state, "ui:langChosen": true, "page:lang": "en" },
		} as never);
		expect((en as Record<string, unknown>).replyText).toBe(
			"Added to your cart: 1 × Keychron K2 Keyboard, 3 × Braided HDMI Cable 2m.",
		);
		const ru = await action.execute({
			state: { ...state, "ui:langChosen": true, "page:lang": "ru" },
		} as never);
		expect((ru as Record<string, unknown>).replyText).toBe(
			"Добавил в корзину: 1 × Keychron K2 Keyboard, 3 × Braided HDMI Cable 2m.",
		);
	});

	test("and says what could not be found", async () => {
		const action = createTemplateReplyAction(undefined);
		const en = await action.execute({
			state: {
				...state,
				"ui:langChosen": true,
				"page:lang": "en",
				missingItems: missing,
			},
		} as never);
		expect((en as Record<string, unknown>).replyText).toBe(
			"Added to your cart: 1 × Keychron K2 Keyboard, 3 × Braided HDMI Cable 2m. Not found: quantum toaster.",
		);
		const ru = await action.execute({
			state: {
				...state,
				"ui:langChosen": true,
				"page:lang": "ru",
				missingItems: missing,
			},
		} as never);
		expect(String((ru as Record<string, unknown>).replyText)).toEndWith(
			"Не нашёл: quantum toaster.",
		);
	});

	test("the reply model is told the whole outcome too", () => {
		const [chunk] = replyChunks({ ...state, missingItems: missing }, 1000);
		expect(chunk).toContain(
			"1 × Keychron K2 Keyboard, 3 × Braided HDMI Cable 2m",
		);
		expect(chunk).toContain("quantum toaster");
	});
});

describe("the templated reply after removing every item", () => {
	const removed = JSON.stringify([
		{ name: "Spaghetti", quantity: 1 },
		{ name: "Sea Salt", quantity: 2 },
	]);
	const state = {
		inCart: false,
		messageIntent: "removeFromCart",
		scopeAll: true,
		listRead: true,
		userMessage: "x",
		removedItems: removed,
	};
	const run = async (extra: Record<string, unknown>) =>
		(
			(await createRemovalReplyAction(undefined).execute({
				state: { ...state, ...extra },
			} as never)) as Record<string, unknown>
		).replyText;

	test("it says what was removed in ru, en and kk", async () => {
		expect(await run({ "ui:langChosen": true, "page:lang": "en" })).toBe(
			"Removed from your cart: 1 × Spaghetti, 2 × Sea Salt.",
		);
		expect(await run({ "ui:langChosen": true, "page:lang": "ru" })).toBe(
			"Убрал из корзины: 1 × Spaghetti, 2 × Sea Salt.",
		);
		expect(await run({ "ui:langChosen": true, "page:lang": "kk" })).toBe(
			"Себеттен алынды: 1 × Spaghetti, 2 × Sea Salt.",
		);
	});

	test("a list the site showed empty is reported as already empty, from the site's answer", async () => {
		const empty = { removedItems: undefined, listEmpty: true };
		expect(
			await run({ ...empty, "ui:langChosen": true, "page:lang": "en" }),
		).toBe("Your cart is already empty.");
		expect(
			await run({ ...empty, "ui:langChosen": true, "page:lang": "ru" }),
		).toBe("В корзине уже пусто.");
	});

	test("the planner uses it only after the list was read, for a removal of everything", () => {
		const read: GoapAction = {
			name: "get_cart",
			cost: 3,
			preconditions: {},
			effects: { listRead: true },
			execute: async () => ({}),
		};
		const remove: GoapAction = {
			name: "update_cart_item",
			cost: 3,
			preconditions: { listRead: true },
			effects: { inCart: false },
			execute: async () => ({}),
		};
		const catalog = [...buildActions(fakeAgentForRemoval, 100), read, remove];
		const steps = plan(
			{ messageIntent: "removeFromCart", scopeAll: true },
			{ replied: true, inCart: false },
			catalog,
		);
		expect(steps?.map((a) => a.name)).toEqual([
			"get_cart",
			"update_cart_item",
			REMOVAL_REPLY_ACTION,
		]);
		// One product only: the model's reply, as before.
		const single = plan(
			{ messageIntent: "removeFromCart" },
			{ replied: true, inCart: false },
			catalog,
		);
		expect(single?.map((a) => a.name)).not.toContain(REMOVAL_REPLY_ACTION);
	});
});

const fakeAgentForRemoval = {
	async *handleMessageStream() {},
	async resetThread() {},
};

describe("replyChunks after a removal or checkout no tool carried out", () => {
	test("the model is told nothing was done and to claim nothing about the site", () => {
		const [chunk] = replyChunks(
			{ userMessage: "удали все из корзины", messageIntent: "removeFromCart" },
			1000,
		);
		expect(chunk).toContain("удали все из корзины");
		expect(chunk).toContain("no step was run");
		expect(chunk).toContain("claim nothing");
	});

	test("once a tool ran, the old behaviour stays", () => {
		const [chunk] = replyChunks(
			{
				userMessage: "удали сыр",
				messageIntent: "removeFromCart",
				"toolResult:update_cart_item": true,
			},
			1000,
		);
		expect(chunk).toBe("удали сыр");
	});
});
