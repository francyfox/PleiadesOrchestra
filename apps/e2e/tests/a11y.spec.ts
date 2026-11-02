import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mockWidgetApi } from "./widget-api-mock";

/**
 * WCAG 2.2 AA scan (axe-core) of the docs site build on :4311 (see
 * playwright.config.ts): each page in light, dark and at a phone viewport.
 * The widget's orchestrator is mocked so the chat renders without a backend.
 */
const SITE = "http://localhost:4311";
const PAGES = [
	"/",
	"/ru/",
	"/kk/",
	"/playground/",
	"/ru/playground/",
	"/docs/intro/",
];
const VARIANTS = [
	{ name: "light", colorScheme: "light", viewport: undefined },
	// SveltePress defaults to "auto": the head script adds `.dark` from prefers-color-scheme.
	{ name: "dark", colorScheme: "dark", viewport: undefined },
	{
		name: "phone",
		colorScheme: "light",
		viewport: { width: 390, height: 844 },
	},
] as const;

for (const path of PAGES) {
	for (const variant of VARIANTS) {
		test(`a11y ${path} (${variant.name})`, async ({ page }) => {
			await mockWidgetApi(page);
			await page.emulateMedia({
				colorScheme: variant.colorScheme,
				reducedMotion: "reduce",
			});
			if (variant.viewport) await page.setViewportSize(variant.viewport);
			await page.goto(SITE + path);
			await expect(page.locator("html")).toHaveClass(
				variant.colorScheme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/,
			);
			if (path.includes("playground"))
				await expect(page.locator("pleiades-chat textarea")).toBeVisible();
			await page.waitForLoadState("networkidle");

			const { violations } = await new AxeBuilder({ page })
				.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
				// Third-party WebMCP demo shops, not our markup.
				.exclude('iframe[title="WebMCP Demo"]')
				.analyze();

			const report = violations
				.map(
					(v) =>
						`${v.id} [${v.impact}] ${v.help} (${v.helpUrl})\n${v.nodes
							.map((n) => `    ${n.target.join(" ")}`)
							.join("\n")}`,
				)
				.join("\n");
			expect(violations, report).toEqual([]);
		});
	}
}

// Keyboard: the paths a Tab/arrow/Escape user takes through the landing and the theme's header.
test.describe("keyboard on /ru/", () => {
	test.beforeEach(async ({ page }) => {
		await mockWidgetApi(page);
		await page.emulateMedia({ reducedMotion: "reduce" });
	});

	test("the first Tab lands on the skip link, Enter moves focus into <main>", async ({
		page,
	}) => {
		await page.goto(`${SITE}/ru/`);
		await page.keyboard.press("Tab");
		await expect(page.locator(".skip-link")).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(page.locator("main#main")).toBeFocused();
	});

	test("nothing inside the flow graph is focusable", async ({ page }) => {
		await page.goto(`${SITE}/ru/`);
		await expect(
			page.locator(".svelte-flow .svelte-flow__node").first(),
		).toBeAttached();
		await expect(
			page.locator(".svelte-flow .svelte-flow__edge").first(),
		).toBeAttached();
		const focusable = await page
			.locator(".svelte-flow")
			.evaluate(
				(el) =>
					el.querySelectorAll(
						'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
					).length,
			);
		expect(focusable).toBe(0);
	});

	test("ArrowRight moves focus and selection on the flow and code tabs", async ({
		page,
	}) => {
		await page.goto(`${SITE}/ru/`);
		for (const tabs of [
			page.locator('[id^="flow-tab-"]'),
			page.locator('[id^="benefit-tab-"]'),
		]) {
			await tabs.first().focus();
			await page.keyboard.press("ArrowRight");
			await expect(tabs.nth(1)).toBeFocused();
			await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
			await expect(tabs.nth(1)).toHaveAttribute("tabindex", "0");
			await expect(tabs.first()).toHaveAttribute("tabindex", "-1");
		}
	});

	test("Enter on the dark-mode toggle flips .dark on <html>", async ({
		page,
	}) => {
		// "auto" on a dark system: the theme's next mode is light.
		await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
		await page.goto(`${SITE}/ru/`);
		await expect(page.locator("html")).toHaveClass(/\bdark\b/);
		await page.locator(".toggle[role=button]").focus();
		await page.keyboard.press("Enter");
		await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
	});

	test("at 390px the burger opens with Enter and closes with Escape, focus back on it", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`${SITE}/ru/`);
		const trigger = page.locator(".nav-trigger");
		await trigger.focus();
		await page.keyboard.press("Enter");
		await expect(trigger).toHaveAttribute("aria-expanded", "true");
		await expect(page.locator("#sveltepress-mobile-navigation")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(trigger).toHaveAttribute("aria-expanded", "false");
		await expect(page.locator("#sveltepress-mobile-navigation")).toBeHidden();
		await expect(trigger).toBeFocused();
	});
});
