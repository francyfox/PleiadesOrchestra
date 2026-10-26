import type { Product } from "./efficiency.shop.ts";
import type { EfficiencyCase } from "./efficiency.types.ts";

/**
 * The cases, built from the seeded catalog so names and prices are the shop's
 * own: add one / a count / a list, a price question, remove one, remove all,
 * and an out-of-stock product that must not be added. Each in English and,
 * with the same carts, in Russian (`-ru`; product names stay the catalog's).
 */
export function buildCases(catalog: Product[]): EfficiencyCase[] {
	const inStock = catalog.filter((product) => product.inStock);
	const [a, b, c, d, e] = inStock;
	const gone = catalog.find((product) => !product.inStock);
	if (!a || !b || !c || !d || !e || !gone)
		throw new Error("catalog too small for the cases");

	const en: EfficiencyCase[] = [
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
			lookedUp: e.name,
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
	].map((one) => ({ ...one, lang: "en" as const }));
	const ru: Record<string, string> = {
		"add-one": `Добавь ${a.name} в корзину.`,
		"add-count": `Положи в корзину 3 ${b.name}.`,
		"add-list": `Добавь в корзину: ${c.name}, ${d.name} и ${e.name}.`,
		price: `Сколько стоит ${e.name}?`,
		"remove-one": `Убери ${a.name} из корзины.`,
		"remove-all": "Удали всё из корзины.",
		"out-of-stock": `Добавь ${gone.name} в корзину.`,
	};
	return [
		...en,
		...en.map((one) => ({
			...one,
			id: `${one.id}-ru`,
			text: ru[one.id] ?? one.text,
			lang: "ru" as const,
		})),
	];
}
