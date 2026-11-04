import { expect, test } from "bun:test";
import { usdToNano } from "./ledger.service.ts";

test("a debit rounds up to whole nano-USD, never adds a nano for float noise, and nothing costs nothing", () => {
	expect(usdToNano(0.000_000_000_1)).toBe(1); // under half a nano: still charged
	expect(usdToNano(0.000_000_002_4)).toBe(3);
	expect(usdToNano(0.3)).toBe(300_000_000); // 0.3 * 1e9 = 300000000.00000006
	// 1000 tokens at OpenRouter's 0.0000000269/token: exactly 26.9 micro-USD.
	expect(usdToNano(1000 * 0.000_000_026_9)).toBe(26_900);
	expect(usdToNano(0)).toBe(0);
});
