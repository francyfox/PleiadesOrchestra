import { expect, test } from "bun:test";
import { localeFromPath } from "./i18n.ts";

test("the locale is the path's first segment, else the default", () => {
	expect(localeFromPath("/")).toBe("en");
	expect(localeFromPath("/playground/")).toBe("en");
	expect(localeFromPath("/ru/")).toBe("ru");
	expect(localeFromPath("/kk/playground/")).toBe("kk");
	expect(localeFromPath("/rules/")).toBe("en");
});
