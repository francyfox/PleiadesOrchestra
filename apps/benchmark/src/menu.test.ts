import { describe, expect, test } from "bun:test";
import { menuText, pick } from "./menu.ts";

const items = [
	{ name: "tools", description: "Delta: tool call arguments" },
	{ name: "snake", description: "Laya: decision latency" },
];

describe("pick", () => {
	test("by number or by name", () => {
		expect(pick("1", items)).toBe("tools");
		expect(pick(" 2 ", items)).toBe("snake");
		expect(pick("snake", items)).toBe("snake");
	});

	test("anything else picks nothing", () => {
		for (const answer of ["", "0", "3", "chess", null]) {
			expect(pick(answer, items)).toBeUndefined();
		}
	});
});

test("the menu numbers every benchmark with its description", () => {
	const text = menuText(items);
	expect(text).toContain("1) tools");
	expect(text).toContain("Delta: tool call arguments");
	expect(text).toContain("2) snake");
});
