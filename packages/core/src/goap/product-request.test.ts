import { describe, expect, test } from "bun:test";
import {
	createProductRequestAction,
	extractProductRequest,
	extractProductRequestRu,
	isSimpleRequest,
	namesNoProduct,
	parseProductRequest,
	reuseLastProduct,
} from "./product-request.ts";

describe("parseProductRequest", () => {
	test("reads query and quantity from the model's JSON", () => {
		expect(
			parseProductRequest('{"query":"cheese","quantity":3}', "купи 3 сыра"),
		).toEqual({
			query: "cheese",
			quantity: 3,
		});
	});

	test("ignores chatter around the JSON", () => {
		expect(
			parseProductRequest(
				'Конечно! {"query": " milk ", "quantity": 1} Готово.',
				"молоко",
			),
		).toEqual({ query: "milk", quantity: 1 });
	});

	test("a missing or silly quantity becomes 1, a huge one is capped", () => {
		expect(parseProductRequest('{"query":"tea"}', "чай").quantity).toBe(1);
		expect(
			parseProductRequest('{"query":"tea","quantity":-2}', "чай").quantity,
		).toBe(1);
		expect(
			parseProductRequest('{"query":"tea","quantity":2.5}', "чай").quantity,
		).toBe(1);
		expect(
			parseProductRequest('{"query":"tea","quantity":5000}', "чай").quantity,
		).toBe(99);
	});

	test("without usable JSON the user's own words and first number are used", () => {
		expect(parseProductRequest("не знаю", "купи 4 яблока")).toEqual({
			query: "купи 4 яблока",
			quantity: 4,
		});
		expect(parseProductRequest('{"query":""}', "сыр")).toEqual({
			query: "сыр",
			quantity: 1,
		});
	});
});

describe("extractProductRequest (from the English translation, no model)", () => {
	const cases: [string, { query: string; quantity: number }][] = [
		["buy one cheese.", { query: "cheese", quantity: 1 }],
		["Buy 1 cheese", { query: "cheese", quantity: 1 }],
		["Add milk to the basket.", { query: "milk", quantity: 1 }],
		["Put the bread in the basket.", { query: "bread", quantity: 1 }],
		["I want apples.", { query: "apples", quantity: 1 }],
		["order three bananas.", { query: "bananas", quantity: 3 }],
		["Buy two bottles of milk.", { query: "milk", quantity: 2 }],
		["Take three bananas.", { query: "bananas", quantity: 3 }],
		["get me a dozen eggs", { query: "eggs", quantity: 12 }],
		[
			"Add the cheapest laptop to the basket.",
			{ query: "cheapest laptop", quantity: 1 },
		],
		["Throw the eggs in the basket.", { query: "eggs", quantity: 1 }],
		["Find me rice.", { query: "rice", quantity: 1 }],
		["Put down 2 kilos of apples.", { query: "apples", quantity: 2 }],
		["Look for yogurt.", { query: "yogurt", quantity: 1 }],
		["I need bread.", { query: "bread", quantity: 1 }],
		["I'd like to buy some rice", { query: "rice", quantity: 1 }],
		["add 5 oranges to my cart please", { query: "oranges", quantity: 5 }],
		[
			"Find the milk cheaper than $5.",
			{ query: "milk cheaper than $5", quantity: 1 },
		],
	];

	for (const [english, expected] of cases) {
		test(`«${english}» → ${expected.quantity} × ${expected.query}`, () => {
			expect(extractProductRequest(english, "исходное сообщение")).toEqual(
				expected,
			);
		});
	}

	test("a quantity of more than 99 is capped, one that is not a count is ignored", () => {
		expect(extractProductRequest("buy 500 apples", "x").quantity).toBe(99);
		expect(
			extractProductRequest("buy apples for 5 dollars", "x").quantity,
		).toBe(1);
	});

	test("nothing left after the verbs: the user's own words are the query", () => {
		expect(extractProductRequest("Please.", "купи сыр")).toEqual({
			query: "купи сыр",
			quantity: 1,
		});
	});

	test("at most four words are kept as the query", () => {
		expect(
			extractProductRequest(
				"buy some very very fresh organic whole milk",
				"x",
			).query.split(" ").length,
		).toBeLessThanOrEqual(4);
	});
});

describe("createProductRequestAction with a translation", () => {
	test("reads the request from the English text and never calls the text model", async () => {
		let called = false;
		const action = createProductRequestAction({
			agent: {
				async *handleMessageStream() {
					called = true;
					yield { type: "delta", text: "" };
				},
				async resetThread() {},
			},
		});

		const result = await action.execute({
			state: { userMessage: "купи 2 сыра", userMessageEn: "Buy two cheeses." },
		});

		expect(result).toEqual({
			requestParsed: true,
			query: "cheeses",
			quantity: 2,
		});
		expect(called).toBe(false);
	});

	test("a noisy request is left to the function-call model: no rule-made query", async () => {
		let called = false;
		const action = createProductRequestAction({
			agent: {
				async *handleMessageStream() {
					called = true;
					yield { type: "delta", text: "" };
				},
				async resetThread() {},
			},
		});

		const result = await action.execute({
			state: {
				userMessage: "хорошо, раз не можешь найти ананас, найди мне сыр",
				userMessageEn:
					"Well, if you can't find the pineapple, find me some cheese.",
			},
		});

		expect(result).toEqual({ requestParsed: true, quantity: 1 });
		expect(called).toBe(false);
	});

	test("a long request is condensed by the text model first", async () => {
		const action = createProductRequestAction({
			agent: {
				async *handleMessageStream() {
					yield { type: "delta", text: '{"query":"brake pads","quantity":2}' };
				},
				async resetThread() {},
			},
		});

		const result = await action.execute({
			state: {
				userMessage: "длинный текст",
				userMessageEn: `${"My car makes a strange noise when I brake. ".repeat(10)}I need two brake pads.`,
			},
		});

		expect(result).toEqual({
			requestParsed: true,
			query: "brake pads",
			quantity: 2,
		});
	});

	test("without a translation the text model still reads it", async () => {
		const action = createProductRequestAction({
			agent: {
				async *handleMessageStream() {
					yield { type: "delta", text: '{"query":"cheese","quantity":1}' };
				},
				async resetThread() {},
			},
		});

		const result = await action.execute({
			state: { userMessage: "купи 1 сыр" },
		});

		expect(result).toEqual({
			requestParsed: true,
			query: "cheese",
			quantity: 1,
		});
	});
});

describe("extractProductRequestRu (a catalog written in Russian)", () => {
	const cases: [string, { query: string; quantity: number }][] = [
		["купи 1 сыр", { query: "сыр", quantity: 1 }],
		["Купи сыр", { query: "сыр", quantity: 1 }],
		["добавь молоко в корзину", { query: "молоко", quantity: 1 }],
		["положи в корзину хлеб", { query: "хлеб", quantity: 1 }],
		["хочу яблоки", { query: "яблоки", quantity: 1 }],
		["мне нужен рис", { query: "рис", quantity: 1 }],
		["закажи три банана", { query: "банана", quantity: 3 }],
		["добавь 2 пакета молока", { query: "молока", quantity: 2 }],
		["купи две бутылки воды", { query: "воды", quantity: 2 }],
		["закинь в корзину яйца, пожалуйста", { query: "яйца", quantity: 1 }],
		["найди тормозные колодки", { query: "тормозные колодки", quantity: 1 }],
		["купи 4 лампы h7", { query: "лампы h7", quantity: 4 }],
		[
			"мне нужен зарядник для iPhone 15",
			{ query: "зарядник для iPhone 15", quantity: 1 },
		],
	];

	for (const [message, expected] of cases) {
		test(`«${message}» → ${expected.quantity} × ${expected.query}`, () => {
			expect(extractProductRequestRu(message)).toEqual(expected);
		});
	}

	test("nothing left after the verbs: the whole message is the query", () => {
		expect(extractProductRequestRu("пожалуйста")).toEqual({
			query: "пожалуйста",
			quantity: 1,
		});
	});

	test("a number that is part of a model name is not a count", () => {
		expect(extractProductRequestRu("найди iPhone 15 Pro").quantity).toBe(1);
	});
});

describe("createProductRequestAction by the language of the catalog", () => {
	const never = {
		handleMessageStream(): never {
			throw new Error("the text model must not be called");
		},
		async resetThread() {},
	};

	test("a Russian catalog gets the query in Russian, translation or not", async () => {
		const action = createProductRequestAction({ agent: never });
		expect(
			await action.execute({
				state: {
					userMessage: "купи 2 сыра",
					userMessageEn: "Buy two cheeses.",
					catalogLang: "ru",
				},
			}),
		).toEqual({ requestParsed: true, query: "сыра", quantity: 2 });
	});

	test("an English catalog (the default) gets the English query", async () => {
		const action = createProductRequestAction({ agent: never });
		expect(
			await action.execute({
				state: {
					userMessage: "купи 2 сыра",
					userMessageEn: "Buy two cheeses.",
				},
			}),
		).toEqual({ requestParsed: true, query: "cheeses", quantity: 2 });
	});

	test("a catalog in a language there is no rule for gets the shopper's own words", async () => {
		const action = createProductRequestAction({ agent: never });
		expect(
			await action.execute({
				state: {
					userMessage: "сүт сатып ал",
					userMessageEn: "Buy milk",
					catalogLang: "kk",
				},
			}),
		).toEqual({ requestParsed: true, query: "сүт сатып ал", quantity: 1 });
	});
});

describe("namesNoProduct", () => {
	test.each([
		["Now buy them.", undefined],
		["Buy.", undefined],
		["OK, buy it please", undefined],
		["Buy 2", undefined],
	])("%s: nothing but filler", (english) => {
		expect(namesNoProduct({ userMessageEn: english, userMessage: "x" })).toBe(
			true,
		);
	});

	test.each(["Buy those pink shoes.", "Buy cheese.", "find me a phone"])(
		"%s: a product is named",
		(english) => {
			expect(namesNoProduct({ userMessageEn: english, userMessage: "x" })).toBe(
				false,
			);
		},
	);

	test("a Russian catalog is judged on the original message", () => {
		expect(
			namesNoProduct({ userMessage: "а теперь купи их", catalogLang: "ru" }),
		).toBe(true);
		expect(namesNoProduct({ userMessage: "купи", catalogLang: "ru" })).toBe(
			true,
		);
		expect(
			namesNoProduct({
				userMessage: "купи те розовые туфли",
				catalogLang: "ru",
			}),
		).toBe(false);
	});

	test("with no translation the original is used", () => {
		expect(namesNoProduct({ userMessage: "buy them" })).toBe(true);
	});
});

describe("reuseLastProduct", () => {
	test("takes the product from the earlier search and skips the search step", () => {
		expect(
			reuseLastProduct({
				lastProduct: "Butter Croissants",
				userMessage: "а теперь купи 3",
				userMessageEn: "Now buy 3.",
			}),
		).toEqual({
			product: "Butter Croissants",
			query: "Butter Croissants",
			quantity: 3,
			requestParsed: true,
			catalogSearched: true,
		});
	});

	test("nothing when the message names a product or nothing was found before", () => {
		expect(
			reuseLastProduct({
				lastProduct: "Whole Milk",
				userMessage: "купи сыр",
				userMessageEn: "Buy cheese.",
			}),
		).toBeUndefined();
		expect(
			reuseLastProduct({ userMessage: "buy them", userMessageEn: "Buy them." }),
		).toBeUndefined();
		expect(
			reuseLastProduct({
				lastProduct: "",
				userMessage: "buy them",
				userMessageEn: "Buy them.",
			}),
		).toBeUndefined();
	});
});

describe("several products in one message", () => {
	test("commas separate the things; query and quantity stay the first one's", () => {
		const request = extractProductRequest(
			"Buy mechanical keyboard, USB-C hub",
			"купи …",
		);
		expect(request.items).toEqual([
			{ query: "mechanical keyboard", quantity: 1 },
			{ query: "usb-c hub", quantity: 1 },
		]);
		expect(request.query).toBe("mechanical keyboard");
		expect(request.quantity).toBe(1);
	});

	test("every item keeps its own count", () => {
		const request = extractProductRequest(
			"add 2 hdmi cables, three phone cases and a dozen batteries to my cart",
			"x",
		);
		expect(request.items).toEqual([
			{ query: "hdmi cables", quantity: 2 },
			{ query: "phone cases", quantity: 3 },
			{ query: "batteries", quantity: 12 },
		]);
		expect(request.quantity).toBe(2);
	});

	test("«and» after a comma ends the list; each item is cut to four words", () => {
		const request = extractProductRequest(
			"I want wool socks, a black winter jacket with fur hood size large and leather gloves",
			"x",
		);
		expect(request.items?.map((item) => item.query)).toEqual([
			"wool socks",
			"black winter jacket with",
			"leather gloves",
		]);
	});

	test("«and» between two short phrases splits, a counted second phrase too", () => {
		expect(extractProductRequest("buy milk and bread", "x").items).toEqual([
			{ query: "milk", quantity: 1 },
			{ query: "bread", quantity: 1 },
		]);
		expect(
			extractProductRequest("buy 2 packs of pens and 3 notebooks", "x").items,
		).toEqual([
			{ query: "pens", quantity: 2 },
			{ query: "notebooks", quantity: 3 },
		]);
	});

	test("names that contain «and» or «&» are one product", () => {
		for (const text of [
			"buy mac and cheese",
			"buy salt and pepper",
			"buy salt & pepper",
			"buy black and decker drill",
			"order a pair of nuts and bolts organizer box",
		]) {
			expect(extractProductRequest(text, "x").items).toBeUndefined();
		}
		expect(extractProductRequest("buy mac and cheese", "x").query).toBe(
			"mac and cheese",
		);
	});

	test("a decimal comma is not a separator", () => {
		expect(
			extractProductRequest("buy 1,5 liter water", "x").items,
		).toBeUndefined();
	});

	test("a single product behaves as before", () => {
		expect(extractProductRequest("buy two cheeses", "x")).toEqual({
			query: "cheeses",
			quantity: 2,
		});
	});

	test("a list of several is a simple request even when long", () => {
		expect(
			isSimpleRequest(
				"buy 2 hdmi cables, 3 phone cases, a dozen batteries and a usb hub please",
			),
		).toBe(true);
	});

	test("the Russian rules split the same way", () => {
		expect(
			extractProductRequestRu("купи Honeycrisp Apples, Oat Milk").items,
		).toEqual([
			{ query: "Honeycrisp Apples", quantity: 1 },
			{ query: "Oat Milk", quantity: 1 },
		]);
		expect(
			extractProductRequestRu("добавь 2 кабеля, три чехла и дрель в корзину")
				.items,
		).toEqual([
			{ query: "кабеля", quantity: 2 },
			{ query: "чехла", quantity: 3 },
			{ query: "дрель", quantity: 1 },
		]);
		expect(extractProductRequestRu("купи молоко и хлеб").items).toEqual([
			{ query: "молоко", quantity: 1 },
			{ query: "хлеб", quantity: 1 },
		]);
		expect(
			extractProductRequestRu("купи 1,5 литра воды").items,
		).toBeUndefined();
	});

	test("the action puts the list into a fact, the first item into query/quantity", async () => {
		const action = createProductRequestAction({ agent: fakeNoCall() });
		const out = await action.execute({
			state: {
				userMessage: "купи кабель, мышь",
				userMessageEn: "buy a cable, mouse",
			},
		});
		expect(out).toMatchObject({
			requestParsed: true,
			query: "cable",
			quantity: 1,
			requestedItems: JSON.stringify([
				{ name: "cable", quantity: 1 },
				{ name: "mouse", quantity: 1 },
			]),
		});
	});
});

function fakeNoCall() {
	return {
		handleMessageStream() {
			throw new Error("the model must not be called");
		},
		async resetThread() {},
	} as unknown as Parameters<typeof createProductRequestAction>[0]["agent"];
}
