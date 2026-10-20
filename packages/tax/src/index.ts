/** Rates for a Kazakhstan sole proprietor (simplified regime) selling through Polar (Merchant of Record). */
export const DEFAULT_RATES = {
	/** Fixed fee per order in USD (Polar $0.40 + Stripe $0.30). */
	polarFixed: 0.7,
	/** Variable card/platform fee, share of the price (Polar 5% + Stripe 2.9%). */
	polarRate: 0.079,
	/** Payout fee, share of the Polar balance. */
	payoutRate: 0.015,
	/** Simplified-regime tax, share of the money received. */
	taxRate: 0.03,
	/** Bank currency-conversion margin, share of the money received. */
	conversionRate: 0.02,
};

export type Rates = typeof DEFAULT_RATES;

function check(name: string, value: number) {
	if (!Number.isFinite(value) || value < 0) {
		throw new RangeError(`${name} must be a finite number >= 0, got ${value}`);
	}
}

/**
 * Where one order's money goes (USD, unrounded). A price below the fixed fee
 * gives a negative `net`; that is allowed, it is a real loss.
 * @throws RangeError when `price` is negative or not finite.
 */
export function orderBreakdown(price: number, rates: Rates = DEFAULT_RATES) {
	check("price", price);
	const polarFee = rates.polarFixed + price * rates.polarRate;
	const netPolar = price - polarFee;
	const payout = netPolar * (1 - rates.payoutRate);
	const payoutFee = netPolar - payout;
	const tax = payout * rates.taxRate;
	const conversion = payout * rates.conversionRate;
	const losses = polarFee + payoutFee + tax + conversion;
	return {
		price,
		polarFee,
		netPolar,
		payoutFee,
		payout,
		tax,
		conversion,
		losses,
		net: price - losses,
		lossShare: price === 0 ? 0 : losses / price,
	};
}

/**
 * Profit over a set of orders: the fixed fee applies per order, so each order is broken down alone.
 * @throws RangeError when any order or `modelSpend` is negative or not finite.
 */
export function netProfit(
	input: { orders: number[]; modelSpend: number },
	rates: Rates = DEFAULT_RATES,
) {
	check("modelSpend", input.modelSpend);
	let revenue = 0;
	let losses = 0;
	for (const price of input.orders) {
		const b = orderBreakdown(price, rates);
		revenue += b.price;
		losses += b.losses;
	}
	return {
		revenue,
		losses,
		modelSpend: input.modelSpend,
		profit: revenue - losses - input.modelSpend,
	};
}
