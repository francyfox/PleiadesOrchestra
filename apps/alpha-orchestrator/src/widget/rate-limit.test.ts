import { describe, expect, test } from "bun:test";
import { FixedWindowLimiter } from "./rate-limit.ts";

describe("FixedWindowLimiter", () => {
	test("allows up to `limit` hits per key within a window, then refuses", () => {
		const now = 0;
		const limiter = new FixedWindowLimiter(2, 1000, () => now);
		expect(limiter.hit("a")).toBe(true);
		expect(limiter.hit("a")).toBe(true);
		expect(limiter.hit("a")).toBe(false);
		// Other keys have their own budget.
		expect(limiter.hit("b")).toBe(true);
	});

	test("a new window resets the budget", () => {
		let now = 0;
		const limiter = new FixedWindowLimiter(1, 1000, () => now);
		expect(limiter.hit("a")).toBe(true);
		expect(limiter.hit("a")).toBe(false);
		now = 1000;
		expect(limiter.hit("a")).toBe(true);
	});

	test("expired windows are pruned so the map doesn't grow forever", () => {
		let now = 0;
		const limiter = new FixedWindowLimiter(1, 1000, () => now, 2);
		limiter.hit("a");
		limiter.hit("b");
		now = 5000;
		limiter.hit("c");
		expect(limiter.size).toBe(1);
	});
});
