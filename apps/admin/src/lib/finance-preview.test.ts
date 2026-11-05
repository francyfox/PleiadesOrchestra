import { expect, test } from "bun:test";
import { creditPreview } from "./finance-preview.ts";

const rates = {
	feeFixedUsd: 0,
	feePercent: 10,
	payoutPercent: 0,
	taxPercent: 0,
	conversionPercent: 0,
	marginPercent: 20,
	taxBase: "payout",
} as const;

test("a top-up credits the net minus the margin share", () => {
	const [row] = creditPreview(rates, [10]);
	expect(row?.credited).toBeCloseTo(7.2, 10);
	expect(row?.net).toBeCloseTo(9, 10);
});
