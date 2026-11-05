const NANO_USD = 1_000_000_000;

/**
 * TR an order gave and what was held back (fees, taxes and the service share), in USD.
 * Orders from before `credited` was stored show the face value and no difference;
 * non-USD or plan orders without it show nothing.
 */
export function orderCredit(order: {
	kind: string;
	amount: number;
	currency: string;
	credited: number | null;
}) {
	if (order.currency.toLowerCase() !== "usd") return null;
	if (order.credited !== null) {
		const creditedTr = order.credited / NANO_USD;
		return { creditedTr, heldBackUsd: order.amount / 100 - creditedTr };
	}
	return order.kind === "credits"
		? { creditedTr: order.amount / 100, heldBackUsd: null }
		: null;
}
