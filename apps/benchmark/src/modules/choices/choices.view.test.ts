import { describe, expect, test } from "bun:test";
import { colors } from "@bunli/utils";
import type { LayaResult } from "./choices.types.ts";
import { renderLayaCase, renderLayaTable } from "./choices.view.ts";

const plain = (text: string) => colors.strip(text);

const result: LayaResult = {
	id: "car-small-toddler",
	latencyMs: 31.4,
	answers: {
		size: {
			type: "choice",
			choice: "compact",
			probabilities: { compact: 0.91 },
		},
		child_seat: { type: "boolean", probability: 0.12 },
	},
	actual: { size: "compact" },
	fields: [
		{
			name: "size",
			kind: "enum",
			category: "given",
			ok: true,
			expected: "compact",
			actual: "compact",
		},
		{
			name: "child_seat",
			kind: "boolean",
			category: "given",
			ok: false,
			expected: true,
			actual: undefined,
			miss: "left out",
		},
	],
};

describe("renderLayaCase", () => {
	test("request, then each field: verdict, answer, Laya's confidence, the miss", () => {
		const text = plain(
			renderLayaCase(
				{
					id: result.id,
					domain: "car rental",
					request: "small car, toddler too",
				},
				result,
			),
		);
		expect(text).toContain("car-small-toddler");
		expect(text).toContain("car rental · 31 ms");
		expect(text).toContain("small car, toddler too");
		expect(text).toMatch(/✅ size\s+given\s+"compact"\s+p=0\.91/);
		expect(text).toMatch(
			/❌ child_seat\s+given\s+—\s+p=0\.12\s+left out, want true/,
		);
	});
});

describe("renderLayaTable", () => {
	test("decisions by kind and category, whole requests, speed; within 5 columns", () => {
		const text = plain(
			renderLayaTable("Laya (server)", {
				requests: 30,
				decisions: { right: 60, total: 80 },
				allRight: 0.4,
				byKind: { enum: { right: 40, total: 50 } },
				byCategory: { unsaid: { right: 10, total: 20 } },
				p50Ms: 31.2,
				p90Ms: 40,
				meanMs: 33,
			}),
		);
		expect(text).toContain("75% (60/80)");
		expect(text).toContain("80% (40/50)");
		expect(text).toContain("50% (10/20)");
		expect(text).toContain("🔴 40%");
		expect(text).toContain("—");
		const header = text.split("\n").find((line) => line.startsWith("|"));
		expect(header?.split("|").length).toBeLessThanOrEqual(5 + 2);
	});
});
