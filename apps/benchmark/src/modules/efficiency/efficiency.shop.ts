import { en, Faker } from "@faker-js/faker";
import type {
	McpCallToolResult,
	McpClient,
	McpToolDescriptor,
} from "@repo/core";

/** One tool call as the shop saw it, for the traces. */
export interface ShopCall {
	name: string;
	arguments: Record<string, unknown>;
	text: string;
	isError: boolean;
}

export interface Product {
	name: string;
	department: string;
	price: number;
	inStock: boolean;
}

const CATALOG_SIZE = 40;
const SEARCH_LIMIT = 5;

/**
 * The tools a shop page would announce, in the shape the orchestrator already
 * serves on the Basketful demo (a list-parameter add tool, a reader, an edit
 * tool where 0 removes). Faker's products mix every department, not groceries.
 */
const TOOLS: McpToolDescriptor[] = [
	{
		name: "search_products",
		description: "Search the store's catalog by words of a product name.",
		inputSchema: {
			type: "object",
			properties: { query: { type: "string", description: "Search words" } },
			required: ["query"],
		} as McpToolDescriptor["inputSchema"],
	},
	{
		name: "add_to_cart",
		description: "Add one or more products to the cart.",
		inputSchema: {
			type: "object",
			properties: {
				items: {
					type: "array",
					items: {
						type: "object",
						properties: {
							product: { type: "string", description: "Product name" },
							quantity: { type: "integer", minimum: 1 },
						},
						required: ["product", "quantity"],
					},
				},
			},
			required: ["items"],
		} as McpToolDescriptor["inputSchema"],
	},
	{
		name: "get_cart",
		description: "Read the cart: each item with its quantity and price.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "update_cart_item",
		description:
			"Set the quantity of a product already in the cart, or remove it by setting the quantity to 0.",
		inputSchema: {
			type: "object",
			properties: {
				product: { type: "string" },
				quantity: {
					type: "integer",
					minimum: 0,
					description: "The new total quantity. 0 removes it from the cart.",
				},
			},
			required: ["product", "quantity"],
		} as McpToolDescriptor["inputSchema"],
	},
];

const answer = (text: string, isError = false): McpCallToolResult => ({
	content: [{ type: "text", text }],
	...(isError ? { isError } : {}),
});

const words = (text: string) =>
	text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** A seeded faker catalog with unique names; some products are out of stock. */
function buildCatalog(seed: number): Product[] {
	const faker = new Faker({ locale: [en] });
	faker.seed(seed);
	const byName = new Map<string, Product>();
	while (byName.size < CATALOG_SIZE) {
		const name = faker.commerce.productName();
		byName.set(name, {
			name,
			department: faker.commerce.department(),
			price: Number(faker.commerce.price({ min: 2, max: 300 })),
			inStock: faker.datatype.boolean({ probability: 0.85 }),
		});
	}
	return [...byName.values()];
}

/**
 * A mock MCP server: the `McpClient` port of `@repo/core` over an in-memory
 * shop. Both contenders call the same tools; `cart()` and `shown()` are what
 * the cases judge.
 */
export function createMockShop(seed: number) {
	const catalog = buildCatalog(seed);
	const cart = new Map<string, number>();
	/** Every product a search answer listed: what the site told the visitor about. */
	const shown = new Set<string>();
	const log: ShopCall[] = [];
	const find = (name: unknown) =>
		catalog.find(
			(product) =>
				product.name.toLowerCase() === String(name).trim().toLowerCase(),
		);
	const line = (product: Product, quantity: number) =>
		`- ${quantity} × ${product.name} — $${(product.price * quantity).toFixed(2)}`;

	function search(query: unknown): McpCallToolResult {
		const asked = words(String(query ?? ""));
		const scored = catalog
			.map((product) => {
				const own = new Set(words(`${product.name} ${product.department}`));
				return { product, score: asked.filter((word) => own.has(word)).length };
			})
			.filter(({ score }) => score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, SEARCH_LIMIT);
		if (scored.length === 0) return answer(`Nothing found for "${query}".`);
		for (const { product } of scored) shown.add(product.name);
		return answer(
			[
				`Found ${scored.length}:`,
				...scored.map(
					({ product }) =>
						`- ${product.name} — $${product.price.toFixed(2)} (${product.inStock ? "in stock" : "out of stock"})`,
				),
			].join("\n"),
		);
	}

	function add(items: unknown): McpCallToolResult {
		const list = Array.isArray(items) ? items : [];
		const added: string[] = [];
		const failed: string[] = [];
		for (const item of list as { product?: unknown; quantity?: unknown }[]) {
			const product = find(item?.product);
			const quantity = Math.max(1, Math.trunc(Number(item?.quantity) || 1));
			if (!product?.inStock) {
				failed.push(
					`${item?.product} (${product ? "out of stock" : "not found"})`,
				);
				continue;
			}
			cart.set(product.name, (cart.get(product.name) ?? 0) + quantity);
			added.push(`${quantity} × ${product.name}`);
		}
		if (added.length === 0)
			return answer(`Nothing added: ${failed.join(", ") || "no items"}.`, true);
		const tail = failed.length ? ` Not added: ${failed.join(", ")}.` : "";
		return answer(`Added: ${added.join("; ")}.${tail}`);
	}

	function readCart(): McpCallToolResult {
		if (cart.size === 0) return answer("The cart is empty.");
		const lines = [...cart].map(([name, quantity]) =>
			line(find(name) as Product, quantity),
		);
		return answer([`Cart (${cart.size} items):`, ...lines].join("\n"));
	}

	function update(name: unknown, quantity: unknown): McpCallToolResult {
		const product = find(name);
		if (!product || !cart.has(product.name))
			return answer(`"${name}" is not in the cart.`, true);
		const count = Math.trunc(Number(quantity));
		if (!Number.isFinite(count) || count < 0)
			return answer("quantity must be 0 or more.", true);
		if (count === 0) cart.delete(product.name);
		else cart.set(product.name, count);
		return answer(
			count === 0 ? `Removed ${product.name}.` : `${line(product, count)}`,
		);
	}

	function dispatch(
		name: string,
		args: Record<string, unknown>,
	): McpCallToolResult {
		if (name === "search_products") return search(args.query);
		if (name === "add_to_cart") return add(args.items);
		if (name === "get_cart") return readCart();
		if (name === "update_cart_item") return update(args.product, args.quantity);
		return answer(`Unknown tool ${name}.`, true);
	}

	return {
		catalog,
		/** Product name → quantity, the state a case is judged on. */
		cart: () => Object.fromEntries(cart),
		shown: () => [...shown],
		calls: () => log,
		/** Starts a case from a known cart. */
		fill(items: Record<string, number>) {
			cart.clear();
			for (const [name, quantity] of Object.entries(items))
				cart.set(name, quantity);
		},
		async listTools() {
			return { tools: TOOLS };
		},
		async callTool({ name, arguments: args = {} }) {
			const result = dispatch(name, args);
			log.push({
				name,
				arguments: args,
				text: result.content.map((block) => block.text ?? "").join(""),
				isError: result.isError ?? false,
			});
			return result;
		},
	} satisfies McpClient & Record<string, unknown>;
}

export type MockShop = ReturnType<typeof createMockShop>;
