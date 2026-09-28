import { describe, expect, test } from "bun:test";
import { ApiError } from "$lib/api/result";
import { shouldRetry } from "./retry";

describe("shouldRetry", () => {
	test("a 4xx answer is final: asking again changes nothing", () => {
		expect(shouldRetry(0, new ApiError(401, null))).toBe(false);
		expect(shouldRetry(0, new ApiError(404, null))).toBe(false);
	});

	test("an unreachable or failing server is retried once, then given up", () => {
		expect(shouldRetry(0, new TypeError("Failed to fetch"))).toBe(true);
		expect(shouldRetry(0, new ApiError(503, null))).toBe(true);
		expect(shouldRetry(1, new ApiError(503, null))).toBe(false);
	});
});
