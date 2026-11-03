import { expect, test } from "bun:test";
import { usdToMicro } from "./ledger.service.ts";

test("a debit rounds up to whole micro-USD, never adds a micro for float noise, and nothing costs nothing", () => {
	expect(usdToMicro(0.000_000_1)).toBe(1); // under half a micro: still charged
	expect(usdToMicro(0.000_002_4)).toBe(3);
	expect(usdToMicro(0.3)).toBe(300_000); // 0.3 * 1e6 = 300000.00000000006
	expect(usdToMicro(0)).toBe(0);
});
