import { expect, test } from "@playwright/test";
import {
	type Cart,
	cartCount,
	expectCode,
	ok,
	skipUnlessWordPress,
	tool,
	WP,
	wpcli,
} from "../support/wp";

skipUnlessWordPress();

// Per-call limits in units (Pleiades_Limits). Own fixtures: a recipe and a kit named with `tag`, deleted afterwards.
const SIMPLE = 263; // Calvin Klein CK One
const SKU = "DJ-GRO-BRD-APP-016";
const tag = `limits${Date.now()}`;
const created: string[] = [];

const rows = (...quantities: number[]) =>
	quantities.map((quantity) => ({ sku: SKU, quantity, note: "" }));
const create = (type: string, title: string, meta: object) => {
	const id = wpcli(
		"post",
		"create",
		`--post_type=${type}`,
		"--post_status=publish",
		`--post_title=${title}`,
		// One write, so a parallel test cannot cache the bundle list between the post and its meta.
		`--meta_input=${JSON.stringify(meta)}`,
		"--porcelain",
	);
	created.push(id);
};

test.beforeAll(() => {
	// 60 + 41 = 101 units in one call, at the recipe's own servings.
	create("pleiades_recipe", `Big recipe ${tag}`, {
		servings: 2,
		ingredients: rows(60, 41),
	});
	create("product", `Big kit ${tag}`, {
		_pleiades_kit: JSON.stringify(rows(60, 41)),
	});
});
test.afterAll(() => {
	if (created.length) wpcli("post", "delete", ...created, "--force");
});

test.describe("cart limits", () => {
	test("add_to_cart: 20 is added, 21 is refused with LIMIT_EXCEEDED and the cart stays as it was", async ({
		page,
	}) => {
		await page.goto(WP);
		expect(
			ok<Cart>(await tool(page, "add_to_cart", { id: SIMPLE, quantity: 20 }))
				.count,
		).toBe(20);
		const over = await tool(page, "add_to_cart", { id: SIMPLE, quantity: 21 });
		expectCode(over, "LIMIT_EXCEEDED");
		expect(JSON.parse((over as { error: string }).error).hint).toContain("20");
		expect(await cartCount(page)).toBe(20);
	});

	test("add_to_cart 1000 is refused, nothing is added", async ({ page }) => {
		await page.goto(WP);
		expectCode(
			await tool(page, "add_to_cart", { id: SIMPLE, quantity: 1000 }),
			"LIMIT_EXCEEDED",
		);
		expect(await cartCount(page)).toBe(0);
	});

	test("update_cart_item: 99 is set, 100 is refused, 0 still removes", async ({
		page,
	}) => {
		await page.goto(WP);
		const cart = ok<Cart>(await tool(page, "add_to_cart", { id: SIMPLE }));
		const key = cart.items[0]?.key;
		expect(
			ok<Cart>(await tool(page, "update_cart_item", { key, quantity: 99 }))
				.count,
		).toBe(99);
		expectCode(
			await tool(page, "update_cart_item", { key, quantity: 100 }),
			"LIMIT_EXCEEDED",
		);
		expect(await cartCount(page)).toBe(99);
		expect(
			ok<Cart>(await tool(page, "update_cart_item", { key, quantity: 0 }))
				.count,
		).toBe(0);
	});

	test("add_recipe_to_cart: 12 servings are added, 13 are refused", async ({
		page,
	}) => {
		await page.goto(WP);
		const over = await tool(page, "add_recipe_to_cart", {
			recipe: "Fruit Salad",
			servings: 13,
		});
		expectCode(over, "LIMIT_EXCEEDED");
		expect(await cartCount(page)).toBe(0);
		await page.goto(WP);
		ok(
			await tool(page, "add_recipe_to_cart", {
				recipe: "Fruit Salad",
				servings: 12,
			}),
		);
		expect(await cartCount(page)).toBeGreaterThan(0);
	});

	test("a recipe or kit above 100 units is refused as a whole, nothing is added", async ({
		page,
	}) => {
		await page.goto(WP);
		expectCode(
			await tool(page, "add_recipe_to_cart", { recipe: `Big recipe ${tag}` }),
			"LIMIT_EXCEEDED",
		);
		expectCode(
			await tool(page, "add_kit_to_cart", { kit: `Big kit ${tag}` }),
			"LIMIT_EXCEEDED",
		);
		expect(await cartCount(page)).toBe(0);
	});
});
