import { describe, expect, test } from "bun:test";
import { parseReply } from "./reply.model.ts";

describe("parseReply options", () => {
	test("a trailing numbered list becomes options and leaves the text", () => {
		const r = parseReply(
			"What next?\n\n1. Show cheese\n2. Show milk\n3. Open cart",
		);
		expect(r.options).toEqual(["Show cheese", "Show milk", "Open cart"]);
		expect(r.parts).toEqual([{ kind: "text", text: "What next?" }]);
	});

	test("a list that is not at the end stays text", () => {
		const r = parseReply("1. a\n2. b\nThanks!");
		expect(r.options).toEqual([]);
		expect(r.parts).toEqual([{ kind: "text", text: "1. a\n2. b\nThanks!" }]);
	});

	test.each([
		["one item only", "Pick:\n1. a"],
		["not starting at 1", "Pick:\n2. a\n3. b"],
		["not consecutive", "Pick:\n1. a\n3. b"],
		[
			"more than nine",
			`Pick:\n${Array.from({ length: 10 }, (_, i) => `${i + 1}. x`).join("\n")}`,
		],
		["an unfinished item", "Pick:\n1. a\n2. b\n3."],
	])("%s is not a list of options", (_, text) => {
		expect(parseReply(text).options).toEqual([]);
	});

	test("an earlier numbered list followed by the options keeps only the trailing one", () => {
		const r = parseReply("Steps:\n1. a\n2. b\n\nChoose:\n1. x\n2. y");
		expect(r.options).toEqual(["x", "y"]);
		expect(r.parts[0]).toMatchObject({ kind: "text" });
	});
});

describe("parseReply links", () => {
	test("http(s) markdown links become link parts", () => {
		const r = parseReply("See [Cheese](https://shop.test/c?x=1) now");
		expect(r.parts).toEqual([
			{ kind: "text", text: "See " },
			{ kind: "link", text: "Cheese", href: "https://shop.test/c?x=1" },
			{ kind: "text", text: " now" },
		]);
	});

	test.each([
		"[x](javascript:alert(1))",
		"[x](data:text/html,hi)",
		"[x](/relative)",
		"[x](mailto:a@b.c)",
	])("%s stays plain text", (text) => {
		expect(parseReply(text).parts).toEqual([{ kind: "text", text }]);
	});

	test("an unfinished link (streaming) stays text", () => {
		const r = parseReply("See [Chee");
		expect(r.parts).toEqual([{ kind: "text", text: "See [Chee" }]);
	});
});
