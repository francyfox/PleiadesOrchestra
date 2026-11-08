import { expect, test } from "@playwright/test";
import { expectCode, ok, skipUnlessWordPress, tool, WP } from "../support/wp";

skipUnlessWordPress();

test.describe("catalog and content tools", () => {
	test("get_product: variable card lists variation attributes", async ({
		page,
	}) => {
		await page.goto(WP);
		const p = ok<{
			name: string;
			variation_attributes: { name: string; values: string[] }[];
		}>(await tool(page, "get_product", { id: 187 }));
		expect(p.variation_attributes.map((a) => a.name)).toEqual(
			expect.arrayContaining(["Storage", "RAM"]),
		);
	});

	test("get_product with a string id", async ({ page }) => {
		await page.goto(WP);
		expect(
			ok<{ id: number }>(await tool(page, "get_product", { id: "263" })).id,
		).toBe(263);
	});

	test("list_categories", async ({ page }) => {
		await page.goto(WP);
		const c = ok<{ slug: string }[]>(await tool(page, "list_categories", {}));
		expect(c.map((x) => x.slug)).toContain("laptops");
	});

	test("get_current_product on a product page and elsewhere", async ({
		page,
	}) => {
		await page.goto(`${WP}/product/calvin-klein-ck-one/`);
		expect(
			ok<{ id: number }>(await tool(page, "get_current_product", {})).id,
		).toBe(263);
		await page.goto(WP);
		expect(
			ok<{ note?: string }>(await tool(page, "get_current_product", {})).note,
		).toBeTruthy();
	});

	test("search_site then get_page", async ({ page }) => {
		await page.goto(WP);
		const hits = ok<{ id: number; title: string }[]>(
			await tool(page, "search_site", { query: "cart" }),
		);
		expect(hits.length).toBeGreaterThan(0);
		const doc = ok<{ title: string; text: string }>(
			await tool(page, "get_page", { id: hits[0].id }),
		);
		expect(doc.title).toBeTruthy();
	});

	test("open_page: same site opens, foreign origin refused", async ({
		page,
	}) => {
		await page.goto(WP);
		const bad = await tool(page, "open_page", { url: "https://example.com/" });
		expect(bad.ok).toBe(false);
		expectCode(bad, "NOT_ALLOWED");
		ok(await tool(page, "open_page", { url: `${WP}/cart/` }));
		await page.waitForURL(/\/cart\//);
	});
});
