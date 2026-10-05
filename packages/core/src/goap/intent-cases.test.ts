import { describe, expect, test } from "bun:test";
import { INTENT_CASES, INTENT_HOLDOUT } from "./intent-cases.ts";
import { TOOL_INTENTS } from "./intent-taxonomy.ts";

describe("INTENT_CASES", () => {
	test("every expected intent exists, and every intent has at least one case", () => {
		const known = new Set<string>(["chat", ...TOOL_INTENTS]);
		for (const { expected } of INTENT_CASES)
			expect(known.has(expected)).toBe(true);
		const covered = new Set<string>(INTENT_CASES.map((c) => c.expected));
		// `other` is the catch-all: nothing can be said to "need" it.
		for (const intent of known) {
			if (intent !== "other") expect(covered.has(intent)).toBe(true);
		}
	});

	test("no message appears twice, in either set", () => {
		const messages = [...INTENT_CASES, ...INTENT_HOLDOUT].map((c) => c.message);
		expect(new Set(messages).size).toBe(messages.length);
	});
});
