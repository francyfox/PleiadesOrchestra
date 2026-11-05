import { creditFor, orderBreakdown } from "@repo/tax";
import type { FinanceRates } from "admin-api/forms";

export const PREVIEW_AMOUNTS = [5, 10, 20, 50];

/** Per top-up (USD): what is paid, the TR credited, and what is left after fees and tax (the part of it above the credit is the margin). */
export function creditPreview(p: FinanceRates, amounts = PREVIEW_AMOUNTS) {
	const rates = {
		polarFixed: p.feeFixedUsd,
		polarRate: p.feePercent / 100,
		payoutRate: p.payoutPercent / 100,
		taxRate: p.taxPercent / 100,
		conversionRate: p.conversionPercent / 100,
		taxBase: p.taxBase,
	};
	return amounts.map((paid) => {
		const credited = creditFor(paid, rates, p.marginPercent / 100);
		return { paid, credited, net: orderBreakdown(paid, rates).net };
	});
}
