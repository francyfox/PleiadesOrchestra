import { expect, test } from "bun:test";
import { isTimeZone } from "./time-zone.service.ts";

test("accepts IANA names", () => {
	expect(isTimeZone("Asia/Almaty")).toBe(true);
	expect(isTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
	expect(isTimeZone("UTC")).toBe(true);
});

test("refuses what is not a zone name", () => {
	for (const bad of ["", "Mars/Base", "+03:00", "Asia/Almaty; DROP"]) {
		expect(isTimeZone(bad)).toBe(false);
	}
});
