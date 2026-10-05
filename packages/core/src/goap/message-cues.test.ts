import { describe, expect, test } from "bun:test";
import { INTENT_CASES, INTENT_HOLDOUT } from "./intent-cases.ts";
import { intentFromCues } from "./message-cues.ts";

describe("intentFromCues", () => {
	test("the more specific intent wins over the broader one that shares its words", () => {
		// "заказ" is also in «закажи»; «корзину» is also in «положи в корзину».
		expect(intentFromCues("оформи заказ")).toBe("checkout");
		expect(intentFromCues("закажи три банана")).toBe("addToCart");
		expect(intentFromCues("открой корзину")).toBe("navigate");
		expect(intentFromCues("положи в корзину хлеб")).toBe("addToCart");
		expect(intentFromCues("удали сыр из корзины")).toBe("removeFromCart");
		expect(intentFromCues("найди молоко дешевле 5 долларов")).toBe("search");
		expect(intentFromCues("только веганские")).toBe("filter");
	});

	test("an explicit buying verb outranks the words of a filter in the same message", () => {
		// «дешёвый», «cheapest», «only» would make these `filter` — wrongly.
		expect(intentFromCues("добавь самый дешёвый ноутбук в корзину")).toBe(
			"addToCart",
		);
		expect(intentFromCues("buy only organic apples")).toBe("addToCart");
		expect(intentFromCues("купи молоко дешевле 5 долларов")).toBe("addToCart");
		// …while a weak «хочу» / «I want» does not outrank them.
		expect(intentFromCues("хочу только веганское")).toBe("filter");
	});

	test("a store name with a verb of going there is a store choice, not a purchase", () => {
		expect(intentFromCues("хочу покупать в Greenleaf Market")).toBe(
			"chooseStore",
		);
		expect(intentFromCues("go to the Greenleaf market")).toBe("chooseStore");
		expect(intentFromCues("go to the recipes page")).toBe("navigate");
	});

	test("Cyrillic word starts work (JS \\b does not), and ё is the same as е", () => {
		expect(intentFromCues("Купи молоко")).toBe("addToCart");
		expect(intentFromCues("всё, заказываю")).toBe("checkout");
		expect(intentFromCues("все, заказываю")).toBe("checkout");
		expect(intentFromCues("мне нужен хлеб")).toBe("addToCart");
		expect(intentFromCues("что у меня в корзине?")).toBe("navigate");
	});

	test("a word inside another word is not a cue", () => {
		// «мне» ends in «не», «шоппинг» is not «поиск», «headphones» contains «add»? no — but «address» does.
		expect(intentFromCues("мне хорошо")).toBeUndefined();
		expect(intentFromCues("what is your address")).toBeUndefined();
	});

	test("no cue: undefined, so Laya decides", () => {
		expect(intentFromCues("сколько будет два плюс два?")).toBeUndefined();
		expect(intentFromCues("")).toBeUndefined();
	});

	test("when it speaks it is right: every claim agrees with both case sets", () => {
		const wrong = [...INTENT_CASES, ...INTENT_HOLDOUT]
			.map((c) => ({ ...c, got: intentFromCues(c.message) }))
			.filter((c) => c.got !== undefined && c.got !== c.expected)
			.map((c) => `${c.message} → ${c.got} (want ${c.expected})`);
		expect(wrong).toEqual([]);
	});

	test("and it speaks for nearly everything — Laya is left the odd one", () => {
		const all = [...INTENT_CASES, ...INTENT_HOLDOUT];
		const silent = all.filter((c) => intentFromCues(c.message) === undefined);
		expect(silent.length / all.length).toBeLessThan(0.05);
	});
});
