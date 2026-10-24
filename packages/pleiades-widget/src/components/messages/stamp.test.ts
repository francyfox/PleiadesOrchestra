import { describe, expect, test } from "bun:test";
import { strings } from "@/lib/i18n/i18n.ts";
import { stampLabel, stampTitle } from "./stamp.model.ts";

// Local-time dates, so the cases hold in any time zone.
const now = new Date(2026, 9, 24, 15, 30).getTime();
const at = (...args: [number, number, number, number?, number?]) =>
	new Date(...args).getTime();
const label = (ts: number, lang: keyof typeof strings = "en") =>
	stampLabel(ts, now, lang, strings[lang].justNow);

describe("stampLabel", () => {
	test("under a minute is «just now» in the widget's language", () => {
		expect(label(now - 59_000, "ru")).toBe("только что");
		expect(label(now + 5_000, "en")).toBe("just now"); // a clock a bit ahead
	});

	test("under an hour counts minutes", () => {
		expect(label(now - 5 * 60_000, "ru")).toBe("5 мин");
		expect(label(now - 59 * 60_000, "en")).toBe("59m");
	});

	test("today, over an hour ago, is the clock time", () => {
		expect(label(at(2026, 9, 24, 14, 3), "ru")).toBe("14:03");
		expect(label(at(2026, 9, 24, 0, 5), "kk")).toBe("00:05");
	});

	test("yesterday, even a few hours back across midnight", () => {
		expect(label(at(2026, 9, 23, 23, 59), "ru")).toBe("вчера");
		expect(label(at(2026, 9, 23, 8, 0), "en")).toBe("yesterday");
	});

	test("older this year is a short date, another year adds the year", () => {
		expect(label(at(2026, 2, 5), "en")).toBe("Mar 5");
		expect(label(at(2026, 2, 5), "ru")).toBe("5 мар.");
		expect(label(at(2025, 11, 31), "en")).toBe("Dec 31, 2025");
	});

	test("an hour back across midnight right after 00:00 is still minutes, not yesterday", () => {
		const justAfterMidnight = at(2026, 9, 24, 0, 20);
		expect(
			stampLabel(at(2026, 9, 23, 23, 50), justAfterMidnight, "en", "now"),
		).toBe("30m");
	});
});

describe("stampTitle", () => {
	test("the exact local date and time", () => {
		const title = stampTitle(at(2026, 9, 24, 14, 3), "en");
		expect(title).toContain("Oct 24, 2026");
		expect(title).toMatch(/2:03\s?PM/);
		expect(stampTitle(at(2026, 9, 24, 14, 3), "ru")).toContain("14:03");
	});
});
