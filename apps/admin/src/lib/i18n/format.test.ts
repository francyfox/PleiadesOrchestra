import { expect, test } from "bun:test";
import { createFormat } from "./format";

test("numbers group by the locale's rules", () => {
	// ru/kk use a (narrow) no-break space as group separator, en a comma.
	expect(createFormat("en").number(1234567)).toBe("1,234,567");
	expect(createFormat("ru").number(1234567).replace(/\s/g, " ")).toBe(
		"1 234 567",
	);
});

test("milliseconds switch to seconds from 1000 ms, with localized units", () => {
	const en = createFormat("en");
	expect(en.ms(512.4)).toBe("512 ms");
	expect(en.ms(2345)).toBe("2.3 sec");
	expect(createFormat("ru").ms(512)).toBe("512 мс");
	expect(en.ms(null)).toBe("—");
});

test("missing values get the caller's 'no data' text", () => {
	expect(createFormat("en").number(null, "no data")).toBe("no data");
	expect(createFormat("en").date(null)).toBe("—");
});

test("gigabytes: single value and used/total pair with one localized unit", () => {
	const GiB = 1024 ** 3;
	const en = createFormat("en");
	expect(en.gb(1.5 * GiB)).toBe("1.5 GB");
	expect(en.gbPair(17.3 * GiB, 30.8 * GiB)).toBe("17.3 / 30.8 GB");
	expect(en.gb(null)).toBe("—");
	expect(createFormat("ru").gb(1.5 * GiB)).toBe("1,5 ГБ");
});
