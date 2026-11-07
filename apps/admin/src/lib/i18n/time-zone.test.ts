import { expect, test } from "bun:test";
import { createZoneSearch, utcOffsetLabel, zoneOptions } from "./time-zone.ts";

// Winter and summer, so DST zones show the offset that is in effect on that day.
const winter = new Date("2026-01-15T12:00:00Z");
const summer = new Date("2026-07-15T12:00:00Z");

test("the offset is shown as UTC+h, with minutes only when there are some", () => {
	expect(utcOffsetLabel("UTC", winter)).toBe("UTC+0");
	expect(utcOffsetLabel("Asia/Almaty", winter)).toBe("UTC+5");
	expect(utcOffsetLabel("Asia/Kolkata", winter)).toBe("UTC+5:30");
	expect(utcOffsetLabel("America/Sao_Paulo", winter)).toBe("UTC-3");
});

test("a zone with daylight saving follows the date", () => {
	expect(utcOffsetLabel("Europe/Berlin", winter)).toBe("UTC+1");
	expect(utcOffsetLabel("Europe/Berlin", summer)).toBe("UTC+2");
});

test("the picker finds a zone by its offset and by a misspelt name", () => {
	const search = createZoneSearch(zoneOptions(winter));
	const values = (query: string) => search(query).map((option) => option.value);
	expect(values("almaty")[0]).toBe("Asia/Almaty");
	expect(values("almty")).toContain("Asia/Almaty");
	expect(values("+5:30")).toContain("Asia/Kolkata");
	expect(values("utc+5")).toContain("Asia/Almaty");
	expect(values("utc+5")).not.toContain("Europe/Berlin");
	expect(values("5")).toContain("Asia/Almaty");
	expect(values("5")).not.toContain("Europe/Berlin");
	expect(values("-3")).toContain("America/Sao_Paulo");
	expect(values("-3")).not.toContain("Asia/Almaty");
	expect(search("")).toHaveLength(zoneOptions(winter).length);
});

// Firefox lists "UTC" itself in supportedValuesOf; a duplicate option value crashes the picker's keyed {#each}.
test("zone values are unique even when the browser lists UTC", () => {
	const real = Intl.supportedValuesOf;
	Intl.supportedValuesOf = () => ["Asia/Almaty", "UTC"];
	try {
		const values = zoneOptions(winter).map((option) => option.value);
		expect(new Set(values).size).toBe(values.length);
	} finally {
		Intl.supportedValuesOf = real;
	}
});
