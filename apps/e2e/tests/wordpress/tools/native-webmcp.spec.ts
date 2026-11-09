import { expect, test } from "@playwright/test";
import {
	cartCount,
	expectCode,
	ok,
	skipUnlessWordPress,
	tool,
	WP,
} from "../support/wp";

// Chrome's own WebMCP (no polyfill) hides what a tool threw behind "Tool was executed but the
// invocation failed", so the model never learns why add_to_cart failed. Errors must come back as results.
skipUnlessWordPress();
test.use({
	launchOptions: {
		args: [
			"--enable-features=WebMCP,WebModelContext",
			"--enable-experimental-web-platform-features",
		],
	},
});

test.describe("native document.modelContext", () => {
	test("uses the browser's own implementation", async ({ page }) => {
		await page.goto(WP);
		expect(
			await page.evaluate(
				() =>
					(document as unknown as { modelContext: object }).modelContext
						.constructor.name,
			),
		).toBe("ModelContext");
	});

	test("add_to_cart with an id works (number and string)", async ({ page }) => {
		await page.goto(WP);
		ok(await tool(page, "add_to_cart", { id: 263 }));
		ok(await tool(page, "add_to_cart", { id: "263" }));
		expect(await cartCount(page)).toBe(2);
	});

	for (const [name, args, code] of [
		["bad id", { id: 99999999 }, "NOT_FOUND"],
		["variable without variation", { id: 187 }, "VARIATION_REQUIRED"],
		["missing id", {}, "MISSING_ARGUMENT"],
	] as const) {
		test(`add_to_cart ${name}: the caller gets the code ${code}, not the shop's text`, async ({
			page,
		}) => {
			await page.goto(WP);
			const r = await tool(page, "add_to_cart", args);
			expect(r.ok).toBe(false);
			expectCode(r, code);
		});
	}
});
