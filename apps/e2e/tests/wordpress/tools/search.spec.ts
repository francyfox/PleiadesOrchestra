import { expect, type Page, test } from "@playwright/test";
import { ok, type Product, skipUnlessWordPress, tool, WP } from "../support/wp";

skipUnlessWordPress();

/** The tool navigates ~50 ms after it returns: wait for the shop page before the next step. */
const left = (page: Page) => page.waitForURL((u) => u.href !== `${WP}/`);

// search_products returns JSON AND moves the visitor to the shop's results page (a classic site shows pages).
test.describe("search_products", () => {
	test("keyword: result has ids, page shows the shop results", async ({
		page,
	}) => {
		await page.goto(WP);
		const found = ok<Product[]>(
			await tool(page, "search_products", { query: "lip" }),
		);
		expect(found.length).toBeGreaterThan(0);
		expect(found[0].id).toBeGreaterThan(0);
		await expect(page).toHaveURL(/post_type=product|\/product\//);
		await expect(page.locator("body")).toContainText(found[0].name);
	});

	test("several hits go to /?s=...&post_type=product", async ({ page }) => {
		await page.goto(WP);
		const found = ok<Product[]>(
			await tool(page, "search_products", { query: "red" }),
		);
		expect(found.length).toBeGreaterThan(1);
		await page.waitForURL(/post_type=product/);
		expect(new URL(page.url()).searchParams.get("s")).toBe("red");
	});

	test("category by slug and by id both filter", async ({ page }) => {
		await page.goto(WP);
		const bySlug = ok<Product[]>(
			await tool(page, "search_products", { category: "laptops" }),
		);
		expect(bySlug.length).toBeGreaterThan(0);
		await page.waitForURL(
			/product_cat=laptops|product-category\/(.*\/)?laptops/,
		);
		await left(page);
		await page.goto(WP);
		const byId = ok<Product[]>(
			await tool(page, "search_products", { category: "38" }),
		);
		expect(byId.map((p) => p.id).sort()).toEqual(
			bySlug.map((p) => p.id).sort(),
		);
		await page.waitForURL(
			/product_cat=laptops|product-category\/(.*\/)?laptops/,
		); // the shop page filters by slug
	});

	test("wrong category: no error, array back", async ({ page }) => {
		await page.goto(WP);
		const r = await tool(page, "search_products", {
			query: "lipstick",
			category: "no-such-category",
		});
		expect(Array.isArray(ok(r))).toBe(true);
	});

	test("price range and sale filter", async ({ page }) => {
		await page.goto(WP);
		const cheap = ok<{ price: string }[]>(
			await tool(page, "search_products", { query: "red", max_price: 5 }),
		);
		expect(Array.isArray(cheap)).toBe(true);
		await left(page);
		await page.goto(WP);
		const sale = ok<Product[]>(
			await tool(page, "search_products", { on_sale: true }),
		);
		expect(sale.length).toBeGreaterThan(0);
	});

	test("page 2 differs from page 1", async ({ page }) => {
		await page.goto(WP);
		const one = ok<Product[]>(
			await tool(page, "search_products", { query: "a" }),
		);
		await left(page);
		await page.goto(WP);
		const two = ok<Product[]>(
			await tool(page, "search_products", { query: "a", page: 2 }),
		);
		expect(two.length).toBeGreaterThan(0);
		expect(two[0].id).not.toBe(one[0].id);
	});

	test("empty result: empty list, page stays", async ({ page }) => {
		await page.goto(WP);
		const r = ok<Product[]>(
			await tool(page, "search_products", { query: "zzqxjkv" }),
		);
		expect(r).toEqual([]);
		await page.waitForTimeout(400);
		expect(page.url()).toBe(`${WP}/`);
	});
});
