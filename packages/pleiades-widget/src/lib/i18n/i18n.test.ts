import { describe, expect, test } from "bun:test";
import { pickLang, strings } from "@/lib/i18n/i18n.ts";

describe("pickLang", () => {
	test("uses the language subtag, case-insensitively", () => {
		expect(pickLang("ru")).toBe("ru");
		expect(pickLang("RU-kz")).toBe("ru");
		expect(pickLang("kk-KZ")).toBe("kk");
	});

	test("unknown or missing falls back to English", () => {
		expect(pickLang("fr")).toBe("en");
		expect(pickLang("")).toBe("en");
		expect(pickLang(undefined)).toBe("en");
	});
});

describe("strings", () => {
	test("every language has every key (no half-translated widget)", () => {
		const keys = Object.keys(strings.en).sort();
		expect(Object.keys(strings.ru).sort()).toEqual(keys);
		expect(Object.keys(strings.kk).sort()).toEqual(keys);
	});
});
