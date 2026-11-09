import { expect, test } from "@playwright/test";
import {
	cartCount,
	expectCode,
	ok,
	skipUnlessWordPress,
	tool,
	WP,
} from "../support/wp";

skipUnlessWordPress();

test.describe("recipe and kit tools", () => {
	test("list_recipes / list_kits", async ({ page }) => {
		await page.goto(WP);
		const r = ok<{ name: string }[]>(await tool(page, "list_recipes", {}));
		expect(r.map((x) => x.name)).toContain("Fruit Salad");
		const k = ok<{ name: string }[]>(await tool(page, "list_kits", {}));
		expect(k.map((x) => x.name)).toContain("Skincare Routine");
	});

	test("add_recipe_to_cart scales servings", async ({ page }) => {
		await page.goto(WP);
		const one = ok<{ added: unknown[]; message: string }>(
			await tool(page, "add_recipe_to_cart", { recipe: "Fruit Salad" }),
		);
		expect(one.added.length).toBeGreaterThan(0);
		const n1 = await cartCount(page);
		await page.goto(WP);
		ok(
			await tool(page, "add_recipe_to_cart", {
				recipe: "Fruit Salad",
				servings: 8,
			}),
		);
		expect(await cartCount(page)).toBeGreaterThan(n1);
	});

	test("add_kit_to_cart; unknown name is an error, not a hang", async ({
		page,
	}) => {
		await page.goto(WP);
		ok(await tool(page, "add_kit_to_cart", { kit: "Skincare Routine" }));
		expect(await cartCount(page)).toBeGreaterThan(0);
		const bad = await tool(page, "add_kit_to_cart", { kit: "No Such Kit" });
		expect(bad.ok).toBe(false);
		expectCode(bad, "NOT_FOUND");
	});
});
