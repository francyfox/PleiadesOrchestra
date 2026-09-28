import { describe, expect, test } from "bun:test";
import { findSite, parseSites } from "./sites";

describe("parseSites", () => {
	test("reads slug=host pairs, trimming blanks", () => {
		expect(
			parseSites(" shop-a = shop.example.com , shop-b=other.example "),
		).toEqual([
			{ slug: "shop-a", host: "shop.example.com" },
			{ slug: "shop-b", host: "other.example" },
		]);
	});

	test("nothing configured means no sites", () => {
		expect(parseSites("")).toEqual([]);
		expect(parseSites(" , ")).toEqual([]);
	});

	test("an entry without slug=host is a configuration error, not silently dropped", () => {
		expect(() => parseSites("shop-a")).toThrow("PLEIADES_SITES");
		expect(() => parseSites("=host.example")).toThrow("PLEIADES_SITES");
	});
});

describe("findSite", () => {
	const sites = [{ slug: "shop-a", host: "shop.example.com" }];

	test("matches by slug or host, case-insensitively", () => {
		expect(findSite(sites, "shop-a")).toBe(sites[0]);
		expect(findSite(sites, "SHOP.example.com")).toBe(sites[0]);
	});

	test("accepts a full URL and ignores www.", () => {
		expect(findSite(sites, "https://www.shop.example.com/cart?x=1")).toBe(
			sites[0],
		);
	});

	test("an unknown site is undefined", () => {
		expect(findSite(sites, "elsewhere.org")).toBeUndefined();
	});
});
