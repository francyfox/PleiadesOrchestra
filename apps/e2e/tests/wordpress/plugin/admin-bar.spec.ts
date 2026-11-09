import { expect, test } from "@playwright/test";
import { skipUnlessWordPress, WP } from "../support/wp";

skipUnlessWordPress();

// A logged-in admin sees WordPress's fixed bar: the open panel must start below it, not cover it.
test("the open panel starts below the admin bar", async ({ page }) => {
	await page.goto(`${WP}/wp-login.php`);
	await page.fill("#user_login", "admin");
	await page.fill("#user_pass", "admin");
	await page.click("#wp-submit");
	await page.goto(WP);
	const bar = await page.locator("#wpadminbar").boundingBox();
	expect(bar).not.toBeNull();
	await page.evaluate(() => {
		(
			document.querySelector("pleiades-chat") as HTMLElement & { open: boolean }
		).open = true;
	});
	await expect
		.poll(() =>
			page.evaluate(() => {
				const panel = document
					.querySelector("pleiades-chat")
					?.shadowRoot?.querySelector(".panel");
				return panel ? Math.round(panel.getBoundingClientRect().top) : -1;
			}),
		)
		.toBeGreaterThanOrEqual(Math.round((bar?.y ?? 0) + (bar?.height ?? 0)));
});
