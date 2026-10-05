import { describe, expect, test } from "bun:test";
import { currentPage, MAX_PAGE_CHARS } from "@/lib/page/page.ts";

describe("currentPage", () => {
	test("is the path with the language prefix and the query, without origin or hash", () => {
		const url = new URL(
			"https://shop.example/ru/store/a?q=milk&lang=ru#reviews",
		);
		expect(currentPage(url)).toBe("/ru/store/a?q=milk&lang=ru");
	});

	test("is cut at the length the server accepts", () => {
		const page = currentPage({ pathname: `/${"a".repeat(2000)}`, search: "" });
		expect(page?.length).toBe(MAX_PAGE_CHARS);
	});

	test("no location, no page", () => {
		expect(currentPage(undefined)).toBeUndefined();
		expect(currentPage({ pathname: "", search: "" })).toBeUndefined();
	});
});
