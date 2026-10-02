import { describe, expect, test } from "bun:test";
import { stepLanguage } from "./step-text.ts";

describe("stepLanguage", () => {
	test("Russian and Kazakh pages get Russian, English ones English", () => {
		expect(stepLanguage({ "page:lang": "ru" })).toBe("ru");
		expect(stepLanguage({ "page:lang": "kk" })).toBe("ru");
		expect(stepLanguage({ "page:lang": "en-us" })).toBe("en");
		expect(stepLanguage({ "page:lang": "de" })).toBe("en");
	});

	test("an unknown page language means Russian, the product's default", () => {
		expect(stepLanguage({})).toBe("ru");
	});
});
