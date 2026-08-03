import { describe, expect, test } from "bun:test";
import { withTimeout } from "./timeout";

describe("withTimeout", () => {
	test("resolves with the original value when it completes before the timeout", async () => {
		const result = await withTimeout(Promise.resolve("ok"), 100);
		expect(result).toBe("ok");
	});

	test("rejects when the promise takes longer than the timeout", async () => {
		const slow = new Promise((resolve) => setTimeout(resolve, 200));
		expect(withTimeout(slow, 20, "too slow")).rejects.toThrow("too slow");
	});

	test("propagates the original rejection when it happens before the timeout", async () => {
		const failing = Promise.reject(new Error("boom"));
		expect(withTimeout(failing, 1000)).rejects.toThrow("boom");
	});
});
