import { expect, test } from "bun:test";
import { resolveLocale } from "./locale";

const request = (cookie: string | null, acceptLanguage: string | null) => ({
	getCookie: (name: string) => (cookie === null ? null : name ? cookie : null),
	getHeader: (name: string) =>
		name.toLowerCase() === "accept-language" ? acceptLanguage : null,
});

test("a saved choice (cookie) wins over the browser language", () => {
	expect(resolveLocale(request("kk", "en-US,en;q=0.9"))).toBe("kk");
});

test("first visit: best match from Accept-Language among ru/en/kk", () => {
	expect(resolveLocale(request(null, "kk-KZ,kk;q=0.9,ru;q=0.8"))).toBe("kk");
	expect(resolveLocale(request(null, "en-GB,en;q=0.9"))).toBe("en");
});

test("unsupported or missing language falls back to Russian", () => {
	expect(resolveLocale(request(null, "de-DE,de;q=0.9"))).toBe("ru");
	expect(resolveLocale(request(null, null))).toBe("ru");
	expect(resolveLocale(request("xx", null))).toBe("ru");
});
