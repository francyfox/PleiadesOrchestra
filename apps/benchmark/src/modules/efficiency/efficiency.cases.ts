import type { Product } from "./efficiency.shop.ts";
import type { EfficiencyCase } from "./efficiency.types.ts";

/**
 * The cases, built from the seeded catalog so names and prices are the shop's
 * own: add one / a count / a list, a price question, remove one, remove all,
 * and an out-of-stock product that must not be added.
 */
export function buildCases(catalog: Product[]): EfficiencyCase[] {
	const inStock = catalog.filter((product) => product.inStock);
	const [a, b, c, d, e] = inStock;
	const gone = catalog.find((product) => !product.inStock);
	if (!a || !b || !c || !d || !e || !gone)
		throw new Error("catalog too small for the cases");

	return [
		{
			id: "add-one",
			text: `Add ${a.name} to my cart.`,
			start: {},
			expected: { [a.name]: 1 },
		},
		{
			id: "add-count",
			text: `Put 3 ${b.name} in my cart.`,
			start: {},
			expected: { [b.name]: 3 },
		},
		{
			id: "add-list",
			text: `Add to my cart: ${c.name}, ${d.name} and ${e.name}.`,
			start: {},
			expected: { [c.name]: 1, [d.name]: 1, [e.name]: 1 },
		},
		{
			id: "price",
			text: `How much does ${e.name} cost?`,
			start: {},
			expected: {},
			replyIncludes: e.price.toFixed(2),
		},
		{
			id: "remove-one",
			text: `Remove ${a.name} from my cart.`,
			start: { [a.name]: 2, [b.name]: 1 },
			expected: { [b.name]: 1 },
		},
		{
			id: "remove-all",
			text: "Remove everything from my cart.",
			start: { [c.name]: 1, [d.name]: 2 },
			expected: {},
		},
		{
			id: "out-of-stock",
			text: `Add ${gone.name} to my cart.`,
			start: {},
			expected: {},
		},
	];
}
