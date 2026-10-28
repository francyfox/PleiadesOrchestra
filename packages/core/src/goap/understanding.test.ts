import { expect, test } from "bun:test";
import type { FunctionCallAgent } from "#core/function-call-agent";
import {
	conversationContext,
	translateTexts,
	understandingTool,
	understandMessage,
} from "#core/goap/understanding";

const INTENTS = { search: "look for things", addToCart: "buy", other: "else" };

const fake = (answer: unknown): FunctionCallAgent => ({
	fillArguments: async () => answer as Record<string, unknown>,
});

test("a valid answer comes back as is, quantity 0 allowed", async () => {
	const answer = {
		en: "remove all t-shirts",
		tasks: [
			{
				intent: "addToCart",
				text: "remove all t-shirts",
				items: [{ name: "t-shirts", quantity: 0 }],
				attributes: [{ name: "color", value: "red" }],
			},
		],
	};
	expect(await understandMessage(fake(answer), INTENTS, "x", "en")).toEqual(
		answer,
	);
});

test("small talk is an empty task list", async () => {
	expect(
		await understandMessage(
			fake({ en: "hello", tasks: [] }),
			INTENTS,
			"привет",
			"en",
		),
	).toEqual({ en: "hello", tasks: [] });
});

test("unusable answers are undefined", async () => {
	const bad = [
		{},
		{ en: "", tasks: [] },
		{ en: "x" },
		{ en: "x", tasks: "no" },
		{ en: "x", tasks: [{ intent: "fly", text: "a", items: [] }] },
		{ en: "x", tasks: [{ intent: "search", text: "", items: [] }] },
		{
			en: "x",
			tasks: [
				{ intent: "search", text: "a", items: [{ name: "a", quantity: -1 }] },
			],
		},
		{
			en: "x",
			tasks: [
				{ intent: "search", text: "a", items: [{ name: " ", quantity: 1 }] },
			],
		},
	];
	for (const answer of bad)
		expect(
			await understandMessage(fake(answer), INTENTS, "x", "en"),
		).toBeUndefined();
	const failing: FunctionCallAgent = {
		fillArguments: async () => {
			throw new Error("down");
		},
	};
	expect(await understandMessage(failing, INTENTS, "x", "en")).toBeUndefined();
});

test("a task with an unknown intent is dropped when others remain", async () => {
	const good = {
		intent: "search",
		text: "a lamp",
		items: [{ name: "lamp", quantity: 1 }],
	};
	const answer = {
		en: "a lamp and wings",
		tasks: [good, { intent: "fly", text: "wings", items: [] }],
	};
	expect(
		(await understandMessage(fake(answer), INTENTS, "x", "en"))?.tasks,
	).toEqual([{ ...good, attributes: [] }]);
});

test("the tool names the intents and the catalog language", () => {
	const tool = understandingTool(INTENTS, "ru");
	expect(tool.description).toContain("Russian");
	expect(JSON.stringify(tool.inputSchema)).toContain(
		'"enum":["search","addToCart","other"]',
	);
});

test("translateTexts returns the strings in order and refuses a short answer", async () => {
	expect(
		await translateTexts(fake({ texts: ["one", "two"] }), ["раз", "два"]),
	).toEqual(["one", "two"]);
	expect(
		translateTexts(fake({ texts: ["one"] }), ["раз", "два"]),
	).rejects.toThrow();
	expect(
		translateTexts(fake({ texts: ["a", 2] }), ["а", "б"]),
	).rejects.toThrow();
});

test("the instructions demand digits for counts in the English text", () => {
	const { description } = understandingTool(INTENTS, "en");
	expect(description).toContain("count as a digit");
	expect(description).toContain('never "a pair of socks"');
});

test("the earlier assistant message is quoted in the request only when given", async () => {
	const requests: string[] = [];
	const spy: FunctionCallAgent = {
		fillArguments: async ({ request }) => {
			requests.push(request);
			return { en: "add Vista 27 to the cart", tasks: [] };
		},
	};
	await understandMessage(spy, INTENTS, "2", "en", undefined, {
		replyTo: "1. A\n2. B",
	});
	await understandMessage(spy, INTENTS, "2", "en");
	expect(requests[0]).toContain(
		"Earlier assistant message the visitor answers: «1. A\n2. B»",
	);
	expect(requests[0]).toContain("2");
	expect(requests[1]).toBe("2");
});

test("conversationContext: the last assistant message is answered, what came before is the history", () => {
	const chain = [
		{ role: "user", content: "хочу купить томат" },
		{ role: "assistant", content: "Томатов нет. Сок или кетчуп?" },
		{ role: "user", content: "а какой сок есть?" },
		{ role: "assistant", content: "1. Tomato Juice\n2. Organic Tomato Juice" },
	];
	expect(conversationContext(chain)).toEqual({
		replyTo: "1. Tomato Juice\n2. Organic Tomato Juice",
		history: chain.slice(0, 3),
	});
	// The newest message is the visitor's: nothing is being answered.
	expect(conversationContext(chain.slice(0, 3))).toEqual({});
	expect(conversationContext([])).toEqual({});
	// Not text (a tool part): skipped, never quoted as "[object Object]".
	expect(
		conversationContext([
			{ role: "user", content: [{ type: "text", text: "x" }] },
			{ role: "assistant", content: "Pizza or pasta?" },
		]),
	).toEqual({ replyTo: "Pizza or pasta?", history: [] });
});

test("the earlier conversation is quoted oldest first, before the answered message", async () => {
	const requests: string[] = [];
	const spy: FunctionCallAgent = {
		fillArguments: async ({ request }) => {
			requests.push(request);
			return { en: "buy Organic Tomato Juice", tasks: [] };
		},
	};
	await understandMessage(spy, INTENTS, "второй", "en", undefined, {
		replyTo: "1. Tomato Juice\n2. Organic Tomato Juice",
		history: [
			{ role: "user", content: "хочу купить томат" },
			{ role: "assistant", content: "Томатов нет. Сок или кетчуп?" },
		],
	});
	const request = requests[0] ?? "";
	expect(request).toContain(
		"Earlier conversation, oldest first:\nVisitor: «хочу купить томат»\nAssistant: «Томатов нет. Сок или кетчуп?»",
	);
	expect(request.indexOf("Earlier conversation")).toBeLessThan(
		request.indexOf("Earlier assistant message the visitor answers"),
	);
});

test("attributes: broken entries dropped, a missing list is empty", async () => {
	const task = { intent: "search", text: "a pizza", items: [] };
	const out = await understandMessage(
		fake({
			en: "x",
			tasks: [
				{
					...task,
					attributes: [
						{ name: " diet ", value: " vegetarian " },
						{ name: "", value: "x" },
						{ name: "size", value: " " },
						{ name: "n" },
						null,
					],
				},
				task,
			],
		}),
		INTENTS,
		"x",
		"en",
	);
	expect(out?.tasks.map((t) => t.attributes)).toEqual([
		[{ name: "diet", value: "vegetarian" }],
		[],
	]);
});

test("today is given as context; a waiting run adds what was asked and answersPending", async () => {
	const requests: string[] = [];
	const spy: FunctionCallAgent = {
		fillArguments: async ({ request }) => {
			requests.push(request);
			return { en: "on 2026-10-28", answersPending: true, tasks: [] };
		},
	};
	const out = await understandMessage(spy, INTENTS, "на 28", "en", undefined, {
		today: "2026-10-27",
		pending: { request: "book a table", asked: ["the date of the visit"] },
	});
	expect(requests[0]).toContain("Today is 2026-10-27 (Tuesday)");
	expect(requests[0]).toContain("asked the visitor for: the date of the visit");
	expect(requests[0]).toEndWith("Visitor's message: на 28");
	expect(out?.answersPending).toBe(true);
	expect(
		understandingTool(INTENTS, "en").inputSchema.properties,
	).not.toHaveProperty("answersPending");
	expect(understandingTool(INTENTS, "en").description).toContain(
		"full YYYY-MM-DD dates",
	);
	const plain = await understandMessage(
		fake({ en: "x", tasks: [] }),
		INTENTS,
		"x",
		"en",
	);
	expect(plain).not.toHaveProperty("answersPending");
});
