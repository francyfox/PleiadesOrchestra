import { describe, expect, test } from "bun:test";
import { PAGE_FACT, PAGE_LANG_FACT, parsePage, samePage } from "./page.ts";

describe("parsePage", () => {
	test("a language prefix in the path is taken out of the path", () => {
		expect(parsePage("/ru/store/greenleaf")).toEqual({
			path: "/store/greenleaf",
			lang: "ru",
			query: {},
		});
		expect(parsePage("/en-US/cart?x=1")).toMatchObject({
			path: "/cart",
			lang: "en-us",
		});
		expect(parsePage("/ru")).toMatchObject({ path: "/", lang: "ru" });
	});

	test("a language parameter is taken out of the query", () => {
		expect(parsePage("/store?lang=kk&q=milk")).toEqual({
			path: "/store",
			lang: "kk",
			query: { q: "milk" },
		});
		expect(parsePage("/store?locale=en_GB")?.lang).toBe("en-gb");
	});

	test("the path's language wins over the parameter; tracking parameters are dropped", () => {
		expect(parsePage("/ru/a?lang=en&utm_source=x&gclid=1&q=2")).toEqual({
			path: "/a",
			lang: "ru",
			query: { q: "2" },
		});
	});

	test("origin, hash and a trailing slash are ignored; repeated parameters are kept in order", () => {
		expect(parsePage("https://shop.example/store/?dept=a&dept=b#top")).toEqual({
			path: "/store",
			query: { dept: ["a", "b"] },
		});
	});

	test("an empty or unreadable value is undefined", () => {
		expect(parsePage("")).toBeUndefined();
		expect(parsePage("   ")).toBeUndefined();
	});

	test("words that only look like a language are not stripped", () => {
		expect(parsePage("/cart")?.lang).toBeUndefined();
		expect(parsePage("/about/us")).toMatchObject({ path: "/about/us" });
	});
});

describe("samePage", () => {
	test("the language, in the path or in the query, does not make pages different", () => {
		expect(samePage("/ru/store/greenleaf", "/store/greenleaf")).toBe(true);
		expect(samePage("/store/greenleaf", "/en/store/greenleaf")).toBe(true);
		expect(samePage("/store?lang=ru", "/store?lang=en")).toBe(true);
		expect(samePage("/ru/cart", "/en/cart")).toBe(true);
	});

	test("a target without parameters matches the same path with any parameters", () => {
		expect(samePage("/store/greenleaf?q=milk", "/store/greenleaf")).toBe(true);
	});

	test("the target's parameters must all be present, in any order", () => {
		expect(samePage("/s?q=milk&dept=dairy", "/s?dept=dairy&q=milk")).toBe(true);
		expect(samePage("/s?q=milk&dept=dairy&page=2", "/s?q=milk")).toBe(true);
		expect(samePage("/s?q=milk", "/s?q=cheese")).toBe(false);
		expect(samePage("/s?q=milk", "/s?q=milk&dept=dairy")).toBe(false);
		expect(samePage("/s?dept=a&dept=b", "/s?dept=b&dept=a")).toBe(true);
	});

	test("tracking parameters are not compared", () => {
		expect(samePage("/s?q=milk&utm_source=mail", "/s?q=milk")).toBe(true);
		expect(samePage("/s?q=milk", "/s?q=milk&utm_campaign=x")).toBe(true);
	});

	test("different paths, or an unknown current page, are not the same", () => {
		expect(samePage("/cart", "/checkout")).toBe(false);
		expect(samePage(undefined, "/cart")).toBe(false);
		expect(samePage("/cart", "")).toBe(false);
	});

	test("trailing slash, hash and origin do not matter", () => {
		expect(samePage("/cart/", "https://shop.example/cart#top")).toBe(true);
	});
});

test("fact names are the ones the orchestrator writes", () => {
	expect(PAGE_FACT).toBe("page:path");
	expect(PAGE_LANG_FACT).toBe("page:lang");
});
