import { describe, expect, test } from "bun:test";
import { accuracyMark, metricTable, pct } from "./report.view.ts";

describe("accuracyMark", () => {
	test("🟢 from 80%, 🟡 from 50%, 🔴 below", () => {
		expect(accuracyMark(0.8)).toBe("🟢");
		expect(accuracyMark(0.79)).toBe("🟡");
		expect(accuracyMark(0.5)).toBe("🟡");
		expect(accuracyMark(0.49)).toBe("🔴");
	});
});

describe("metricTable", () => {
	const table = metricTable(
		["qwen3-1.7b", "qwen3-1.7b + Laya"],
		[
			["Correct", ["🟡 66%", "🟢 90%"]],
			["p50 ms", ["797", "412"]],
		],
	)
		.split("\n")
		.filter((line) => line.startsWith("|"));

	test("metrics down, one column per run", () => {
		expect(table[0]).toContain("qwen3-1.7b + Laya");
		expect(table.find((line) => line.includes("Correct"))).toContain("🟢 90%");
		expect(table.find((line) => line.includes("p50 ms"))).toContain("412");
	});

	test("every line as wide as the header, marks included", () => {
		expect(new Set(table.map((line) => Bun.stringWidth(line))).size).toBe(1);
	});
});

test("pct is a whole percent", () => {
	expect(pct(0.664)).toBe("66%");
	expect(pct(1)).toBe("100%");
});
