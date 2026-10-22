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

test("USD keeps sub-cent amounts visible", () => {
	const en = createFormat("en");
	expect(en.usd(0.0231)).toBe("$0.0231");
	expect(en.usd(12)).toBe("$12.00");
	expect(en.usd(null)).toBe("—");
});

test("trenni keep two decimals; an overdraft stays negative", () => {
	const en = createFormat("en");
	expect(en.tr(12.3401)).toBe("12.34 TR");
	expect(en.tr(-1.5)).toBe("-1.50 TR");
});

test("order amounts are cents in the order's currency", () => {
	expect(createFormat("en").money(1999, "usd")).toBe("$19.99");
});

test("compact numbers: K/M/B/T suffixes, rounded down, plain below 1000", () => {
	const { compact } = createFormat("en");
	expect(compact(999)).toBe("999");
	expect(compact(1000)).toBe("1K");
	expect(compact(1999)).toBe("1.9K");
	expect(compact(999_999)).toBe("999.9K");
	expect(compact(12_345_678)).toBe("12.3M");
	expect(compact(2_500_000_000)).toBe("2.5B");
	expect(compact(7e12)).toBe("7T");
	expect(compact(-1500)).toBe("-1.5K");
	expect(createFormat("ru").compact(1500)).toBe("1,5K");
	expect(compact(null, "no data")).toBe("no data");
});

test("a probability is shown as a percentage with one decimal", () => {
	expect(createFormat("en").percent(0.9349716873278769)).toBe("93.5%");
	expect(createFormat("en").percent(null)).toBe("—");
});
