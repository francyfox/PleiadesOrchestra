import { expect, type Page, test } from "@playwright/test";
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

const SIMPLE = 263; // Calvin Klein CK One
const OUT_OF_STOCK = 261; // Eyeshadow Palette with Mirror, used by no other test
const VARIABLE = 187; // MacBook: Storage x RAM
const GROUPED = 69; // Home Office Starter: a grouped product has no price of its own
const badge = (page: Page) =>
	page.locator(".wc-block-mini-cart__badge").first();

test.describe("add_to_cart", () => {
	test("simple product, number id and string id", async ({ page }) => {
		await page.goto(WP);
		expect(
			ok<Cart>(await tool(page, "add_to_cart", { id: SIMPLE })).count,
		).toBe(1);
		// a model or an MCP client may send the id as text
		expect(
			ok<Cart>(
				await tool(page, "add_to_cart", { id: String(SIMPLE), quantity: "2" }),
			).count,
		).toBe(3);
		expect(await cartCount(page)).toBe(3);
	});

	test("variable product without variation fails with VARIATION_REQUIRED", async ({
		page,
	}) => {
		await page.goto(WP);
		const r = await tool(page, "add_to_cart", { id: VARIABLE });
		expect(r.ok).toBe(false);
		expectCode(r, "VARIATION_REQUIRED", 400);
		// The reply can list what to choose from.
		const { options } = JSON.parse((r as { error: string }).error) as {
			options: Record<string, string[]>;
		};
		expect(options.Storage).toContain("256 GB");
		expect(options.RAM).toContain("8 GB");
		expect(await cartCount(page)).toBe(0);
	});

	test("variable product with variation", async ({ page }) => {
		await page.goto(WP);
		const r = await tool(page, "add_to_cart", {
			id: VARIABLE,
			variation: { Storage: "256 GB", RAM: "8 GB" },
		});
		expect(ok<Cart>(r).count).toBe(1);
	});

	test("bad id is NOT_FOUND, never the shop's message", async ({ page }) => {
		await page.goto(WP);
		const r = await tool(page, "add_to_cart", { id: 99999999 });
		expect(r.ok).toBe(false);
		expectCode(r, "NOT_FOUND", 400);
		expect(await cartCount(page)).toBe(0);
	});

	test("missing id says where to get one", async ({ page }) => {
		await page.goto(WP);
		const r = await tool(page, "add_to_cart", { quantity: 1 });
		expectCode(r, "MISSING_ARGUMENT");
		expect(JSON.parse((r as { error: string }).error).hint).toMatch(
			/id is required.*search_products/,
		);
	});

	test("zero or negative quantity is INVALID_QUANTITY", async ({ page }) => {
		await page.goto(WP);
		const r = await tool(page, "add_to_cart", { id: SIMPLE, quantity: -1 });
		expectCode(r, "INVALID_QUANTITY", 400);
		expect(await cartCount(page)).toBe(0);
	});

	test("a grouped product cannot be bought directly: NOT_PURCHASABLE", async ({
		page,
	}) => {
		await page.goto(WP);
		expectCode(
			await tool(page, "add_to_cart", { id: GROUPED }),
			"NOT_PURCHASABLE",
			400,
		);
	});

	test("out of stock product", async ({ page }) => {
		test.setTimeout(90_000);
		// Its own product: the stock flips site-wide while parallel tests add SIMPLE.
		const stock = (s: string) =>
			wpcli(
				"eval",
				`$p=wc_get_product(${OUT_OF_STOCK});$p->set_stock_status("${s}");$p->save();`,
			);
		stock("outofstock");
		try {
			await page.goto(WP);
			const r = await tool(page, "add_to_cart", { id: OUT_OF_STOCK });
			expect(r.ok).toBe(false);
			expectCode(r, "OUT_OF_STOCK", 400);
		} finally {
			stock("instock");
		}
	});
});

const isClassic = (page: Page) =>
	page.evaluate(() => !document.querySelector(".wc-block-mini-cart"));

// Clearing the cart: every failure path of update/remove comes back as readable text, never "invocation failed".
test.describe("update_cart_item / remove_cart_item errors", () => {
	const err = (r: unknown) => (r as { error: string }).error;

	test("unknown key: CART_ITEM_GONE", async ({ page }) => {
		await page.goto(WP);
		for (const name of ["remove_cart_item", "update_cart_item"]) {
			const r = await tool(page, name, { key: "nope", quantity: 1 });
			expect(r.ok).toBe(false);
			expectCode(r, "CART_ITEM_GONE", 409);
		}
	});

	test("missing key says where to get one", async ({ page }) => {
		await page.goto(WP);
		for (const name of ["remove_cart_item", "update_cart_item"]) {
			const r = await tool(page, name, { quantity: 1 });
			expectCode(r, "MISSING_ARGUMENT");
			expect(JSON.parse(err(r)).hint).toMatch(/key is required.*get_cart/);
		}
	});

	test("remove on an empty cart is an error, the cart stays empty", async ({
		page,
	}) => {
		await page.goto(WP);
		const r = await tool(page, "remove_cart_item", { key: "gone" });
		expect(r.ok).toBe(false);
		expect(ok<Cart>(await tool(page, "get_cart", {})).count).toBe(0);
	});

	test("quantity 0 clears the item", async ({ page }) => {
		await page.goto(WP);
		ok(await tool(page, "add_to_cart", { id: SIMPLE }));
		const key = ok<Cart>(await tool(page, "get_cart", {})).items[0].key;
		const r = await tool(page, "update_cart_item", { key, quantity: 0 });
		expect(r.ok ? (r.data as Cart).count : -1).toBe(0);
		expect(await cartCount(page)).toBe(0);
	});

	test("removing the same key twice: second call fails readably", async ({
		page,
	}) => {
		await page.goto(WP);
		ok(await tool(page, "add_to_cart", { id: SIMPLE }));
		const key = ok<Cart>(await tool(page, "get_cart", {})).items[0].key;
		ok(await tool(page, "remove_cart_item", { key }));
		const r = await tool(page, "remove_cart_item", { key });
		expect(r.ok).toBe(false);
		expectCode(r, "CART_ITEM_GONE", 409);
	});
});

// The active theme decides the markup: block theme (default) or classic (WORDPRESS_THEME=kadence or storefront, rerun wordpress-setup).
test.describe("cart tools and the UI", () => {
	test("add, get, update, remove; mini cart follows", async ({ page }) => {
		await page.goto(WP);
		const classic = await isClassic(page);
		const mini = classic
			? page.locator(".site-header-cart .count, .header-cart-total").first()
			: badge(page);
		ok(await tool(page, "add_to_cart", { id: SIMPLE, quantity: 2 }));
		await expect(mini).toContainText("2");
		const cart = ok<Cart>(await tool(page, "get_cart", {}));
		expect(cart.count).toBe(2);
		const key = cart.items[0].key;
		expect(
			ok<Cart>(await tool(page, "update_cart_item", { key, quantity: 5 }))
				.count,
		).toBe(5);
		await expect(mini).toContainText("5");
		expect(ok<Cart>(await tool(page, "remove_cart_item", { key })).count).toBe(
			0,
		);
		expect(await cartCount(page)).toBe(0);
	});

	test("cart page updates without a reload after a write", async ({ page }) => {
		await page.goto(`${WP}/cart/`);
		await page.evaluate(
			() => ((window as unknown as { __same: boolean }).__same = true),
		);
		ok(await tool(page, "add_to_cart", { id: SIMPLE }));
		await expect(page.locator("body")).toContainText("Calvin Klein CK One");
		ok(await tool(page, "add_to_cart", { id: 262 }));
		await expect(page.locator("body")).toContainText("Essence Mascara");
		expect(
			await page.evaluate(
				() => (window as unknown as { __same?: boolean }).__same,
			),
		).toBe(true);
	});

	test("checkout order review updates without a reload", async ({ page }) => {
		await page.goto(WP);
		ok(await tool(page, "add_to_cart", { id: SIMPLE }));
		await page.goto(`${WP}/checkout/`);
		await expect(page.locator("body")).toContainText("Calvin Klein CK One");
		await page.evaluate(
			() => ((window as unknown as { __same: boolean }).__same = true),
		);
		ok(await tool(page, "add_to_cart", { id: 262 }));
		await expect(page.locator("body")).toContainText("Essence Mascara");
		expect(
			await page.evaluate(
				() => (window as unknown as { __same?: boolean }).__same,
			),
		).toBe(true);
	});
});
