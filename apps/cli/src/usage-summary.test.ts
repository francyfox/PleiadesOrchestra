import { describe, expect, test } from "bun:test";
import { formatUsageSummary } from "./usage-summary.ts";

describe("formatUsageSummary", () => {
	test("includes tokens/sec computed from output tokens and elapsed time", () => {
		const line = formatUsageSummary({
			elapsedMs: 2000,
			inputTokens: 100,
			outputTokens: 40,
		});
		expect(line).toContain("20.0 tok/s");
	});

	test("includes context window usage percent when a window size is given", () => {
		const line = formatUsageSummary(
			{ elapsedMs: 1000, inputTokens: 300, outputTokens: 212 },
			2048,
		);
		expect(line).toContain("512/2048 tokens");
		expect(line).toContain("25% context");
	});

	test("omits context percent when no window size is given", () => {
		const line = formatUsageSummary({
			elapsedMs: 1000,
			inputTokens: 300,
			outputTokens: 212,
		});
		expect(line).not.toContain("context");
		expect(line).toContain("512 tokens");
	});

	test("omits token/context segments entirely when usage is unavailable", () => {
		const line = formatUsageSummary({ elapsedMs: 500 }, 2048);
		expect(line).not.toContain("tok/s");
		expect(line).not.toContain("tokens");
		expect(line).toBe("0.5s");
	});

	test("always includes total elapsed time in seconds", () => {
		const line = formatUsageSummary({ elapsedMs: 1500 });
		expect(line).toContain("1.5s");
	});
});
