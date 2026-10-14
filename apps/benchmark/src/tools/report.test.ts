import { describe, expect, test } from "bun:test";
import { colors } from "@bunli/utils";
import { accuracyMark, renderFailures, renderTable } from "./report.ts";
import type { Row } from "./run.ts";

const row = (accuracy: number): Row => ({
	model: "qwen3-1.7b",
	mode: "schema",
	summary: {
		cases: 29,
		accuracy,
		valid: 1,
		p50Ms: 797.4,
		p90Ms: 1430.2,
		meanMs: 900,
	},
	meanPromptTokens: 524.8,
	meanOutputTokens: 14.2,
});

const plain = (text: string) => colors.strip(text);

describe("accuracyMark", () => {
	test("🟢 from 80%, 🟡 from 50%, 🔴 below", () => {
		expect(accuracyMark(0.8)).toBe("🟢");
		expect(accuracyMark(0.79)).toBe("🟡");
		expect(accuracyMark(0.5)).toBe("🟡");
		expect(accuracyMark(0.49)).toBe("🔴");
	});
});

describe("renderTable", () => {
	test("a header, a separator and one line per row, with the accuracy marked", () => {
		const lines = plain(renderTable([row(0.655), row(0.9)])).split("\n");
		const table = lines.filter((line) => line.startsWith("|"));
		expect(table).toHaveLength(4);
		expect(table[0]).toContain("Correct");
		expect(table[2]).toContain("🟡 66%");
		expect(table[2]).toContain("797");
		expect(table[3]).toContain("🟢 90%");
	});

	test("every table line is as wide as the header", () => {
		const table = plain(renderTable([row(0.655), row(0.1)]))
			.split("\n")
			.filter((line) => line.startsWith("|"));
		const widths = table.map((line) => Bun.stringWidth(line));
		expect(new Set(widths).size).toBe(1);
	});
});

describe("renderFailures", () => {
	test("each miss: ❌, case, why, and what the model answered", () => {
		const text = plain(
			renderFailures([
				{
					model: "qwen3-1.7b",
					mode: "schema",
					result: {
						id: "search-cheese",
						ok: false,
						valid: true,
						latencyMs: 400,
						actual: { query: "cheese", max_price: 1 },
						reason: "max_price: unexpected",
					},
				},
			]),
		);
		expect(text).toContain("❌ search-cheese");
		expect(text).toContain("max_price: unexpected");
		expect(text).toContain('{"query":"cheese","max_price":1}');
	});

	test("no misses: says so", () => {
		expect(plain(renderFailures([]))).toContain("✅");
	});
});
