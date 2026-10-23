import { describe, expect, test } from "bun:test";
import { en } from "./shop.cues.en.ts";
import { ru } from "./shop.cues.ru.ts";
import { composeCues, type LanguageCues, words } from "./shop.cues.ts";

describe("one file per language", () => {
	test("a language knows only its own words", () => {
		const english = composeCues([en]);
		const russian = composeCues([ru]);
		expect(english.intentFromCues("buy milk")).toBe("addToCart");
		expect(english.intentFromCues("купи молоко")).toBeUndefined();
		expect(russian.intentFromCues("купи молоко")).toBe("addToCart");
		expect(russian.intentFromCues("buy milk")).toBeUndefined();
	});

	test("a Russian sentence with a Latin shop name is a store choice", () => {
		expect(composeCues([ru]).intentFromCues("давай в Greenleaf")).toBe(
			"chooseStore",
		);
	});

	test("ё in a pattern still meets the folded text", () => {
		const russian = composeCues([ru]);
		expect(russian.intentFromCues("покажи ещё результаты")).toBe("paginate");
		expect(russian.intentFromCues("покажи еще результаты")).toBe("paginate");
		expect(russian.asksForAll("убери всё")).toBe(true);
		expect(russian.asksForAll("убери всегда")).toBe(false);
	});

	test("a new language is one more LanguageCues: it adds to the others and keeps their order of slots", () => {
		// A made-up language: «kupi» buys, «plati» pays.
		const toy: LanguageCues = {
			language: "toy",
			slots: { buy: [words("kupi")], checkout: [words("plati")] },
			allOfThem: [words("vse")],
		};
		const all = composeCues([en, ru, toy]);
		expect(all.intentFromCues("kupi sir")).toBe("addToCart");
		expect(all.intentFromCues("kupi i plati")).toBe("checkout"); // checkout outranks buying
		expect(all.intentFromCues("buy milk")).toBe("addToCart");
		expect(all.asksForAll("remove vse")).toBe(true);
	});
});
