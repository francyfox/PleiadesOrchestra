import { describe, expect, test } from "bun:test";
import { INTENT_CASES, INTENT_HOLDOUT } from "./intent-cases.ts";
import { englishOf } from "./intent-cases-en.ts";

const NOT_ENGLISH = /(?!\p{Script=Latin})\p{L}/u;

describe("English renderings of the Russian cases", () => {
	test("every case with non-Latin letters has an English rendering that is Latin only", () => {
		for (const { message } of [...INTENT_CASES, ...INTENT_HOLDOUT]) {
			if (!NOT_ENGLISH.test(message)) {
				expect(englishOf(message)).toBeUndefined();
				continue;
			}
			const english = englishOf(message);
			expect(english, message).toBeDefined();
			expect(NOT_ENGLISH.test(english as string), message).toBe(false);
		}
	});
});
