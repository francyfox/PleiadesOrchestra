import { describe, expect, test } from "bun:test";
import { createMockShop } from "./efficiency.shop.ts";

const text = (result: { content: { text?: string }[] }) =>
	result.content.map((block) => block.text).join("");

describe("createMockShop", () => {
	test("the same seed builds the same catalog", () => {
		expect(createMockShop(1).catalog).toEqual(createMockShop(1).catalog);
		expect(createMockShop(1).catalog).not.toEqual(createMockShop(2).catalog);
	});

	test("lists its tools as MCP does", async () => {
		const { tools } = await createMockShop(1).listTools();
		expect(tools.map((tool) => tool.name)).toEqual([
			"search_products",
			"add_to_cart",
			"get_cart",
			"update_cart_item",
		]);
	});

	test("search finds a product by the words of its name", async () => {
		const shop = createMockShop(1);
		const product = shop.catalog[0];
		if (!product) throw new Error("empty catalog");
		const answer = await shop.callTool({
			name: "search_products",
			arguments: { query: product.name.toLowerCase() },
		});
		expect(text(answer)).toContain(`- ${product.name} — $`);
	});

	test("add, read, remove: the cart is the state the cases judge", async () => {
		const shop = createMockShop(1);
		const [a, b] = shop.catalog.filter((product) => product.inStock);
		if (!a || !b) throw new Error("catalog too small");
		await shop.callTool({
			name: "add_to_cart",
			arguments: {
				items: [
					{ product: a.name, quantity: 2 },
					{ product: b.name, quantity: 1 },
				],
			},
		});
		expect(shop.cart()).toEqual({ [a.name]: 2, [b.name]: 1 });
		expect(
			text(await shop.callTool({ name: "get_cart", arguments: {} })),
		).toContain(`- 2 × ${a.name} — $`);

		await shop.callTool({
			name: "update_cart_item",
			arguments: { product: a.name, quantity: 0 },
		});
		expect(shop.cart()).toEqual({ [b.name]: 1 });
	});

	test("remembers every product a search answer showed", async () => {
		const shop = createMockShop(1);
		const product = shop.catalog[0];
		if (!product) throw new Error("empty catalog");
		expect(shop.shown()).toEqual([]);
		await shop.callTool({
			name: "search_products",
			arguments: { query: product.name },
		});
		expect(shop.shown()).toContain(product.name);
	});

	test("logs every tool call in order with its answer", async () => {
		const shop = createMockShop(1);
		await shop.callTool({ name: "get_cart", arguments: {} });
		await shop.callTool({ name: "fly", arguments: { x: 1 } });
		expect(shop.calls()).toEqual([
			{
				name: "get_cart",
				arguments: {},
				text: "The cart is empty.",
				isError: false,
			},
			{
				name: "fly",
				arguments: { x: 1 },
				text: "Unknown tool fly.",
				isError: true,
			},
		]);
	});

	test("an unknown product or tool is an error answer, not a throw", async () => {
		const shop = createMockShop(1);
		const add = await shop.callTool({
			name: "add_to_cart",
			arguments: { items: [{ product: "No Such Thing", quantity: 1 }] },
		});
		expect(add.isError).toBe(true);
		expect(shop.cart()).toEqual({});
		expect((await shop.callTool({ name: "fly", arguments: {} })).isError).toBe(
			true,
		);
	});
});
