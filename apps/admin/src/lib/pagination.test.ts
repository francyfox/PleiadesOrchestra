import { describe, expect, test } from "bun:test";
import { clampPage, pageCount, pageSlice, parsePage } from "./pagination";

describe("pageCount", () => {
	test("rounds up and is at least one page", () => {
		expect(pageCount(0, 10)).toBe(1);
		expect(pageCount(10, 10)).toBe(1);
		expect(pageCount(11, 10)).toBe(2);
		expect(pageCount(95, 10)).toBe(10);
	});
});

describe("clampPage", () => {
	test("keeps the page inside 1..pages", () => {
		expect(clampPage(0, 3)).toBe(1);
		expect(clampPage(2, 3)).toBe(2);
		expect(clampPage(9, 3)).toBe(3);
	});
});

describe("pageSlice", () => {
	const rows = Array.from({ length: 25 }, (_, index) => index + 1);

	test("returns the rows of a 1-based page", () => {
		expect(pageSlice(rows, 1, 10)).toEqual(rows.slice(0, 10));
		expect(pageSlice(rows, 3, 10)).toEqual([21, 22, 23, 24, 25]);
	});

	test("an out-of-range page falls back to the nearest real one", () => {
		expect(pageSlice(rows, 99, 10)).toEqual([21, 22, 23, 24, 25]);
		expect(pageSlice(rows, -4, 10)).toEqual(rows.slice(0, 10));
	});
});

describe("parsePage", () => {
	test("reads a positive integer from the URL, else page one", () => {
		expect(parsePage("3")).toBe(3);
		expect(parsePage(null)).toBe(1);
		expect(parsePage("abc")).toBe(1);
		expect(parsePage("0")).toBe(1);
		expect(parsePage("-2")).toBe(1);
		expect(parsePage("2.7")).toBe(2);
	});
});
