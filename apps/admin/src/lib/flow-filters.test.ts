import { describe, expect, test } from "bun:test";
import { parseIntent, parseStatus, requestsHref } from "./flow-filters";

describe("parseStatus", () => {
	test("keeps a known status, drops anything else", () => {
		expect(parseStatus("failed")).toBe("failed");
		expect(parseStatus("nope")).toBeUndefined();
		expect(parseStatus(null)).toBeUndefined();
	});
});

describe("parseIntent", () => {
	test("accepts a word, refuses empty or odd input", () => {
		expect(parseIntent("addToCart")).toBe("addToCart");
		expect(parseIntent("")).toBeUndefined();
		expect(parseIntent("a b&c=d")).toBeUndefined();
		expect(parseIntent(null)).toBeUndefined();
	});
});

describe("requestsHref", () => {
	test("leaves out page one and filters that are off", () => {
		expect(requestsHref({})).toBe("?");
		expect(requestsHref({ page: 1 })).toBe("?");
		expect(requestsHref({ page: 3, status: "failed" })).toBe(
			"?status=failed&page=3",
		);
		expect(requestsHref({ intent: "search" })).toBe("?intent=search");
	});
});
