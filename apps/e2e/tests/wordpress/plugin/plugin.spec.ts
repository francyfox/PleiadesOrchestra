import { expect, type Page, test } from "@playwright/test";
import { mockWidgetApi } from "../../widget-api-mock";
import { skipUnlessWordPress, WP, wpcli } from "../support/wp";

skipUnlessWordPress();

// Serial: the localization test changes the shared site option.
test.describe.configure({ mode: "serial" });
test.describe("WordPress plugin", () => {
	test("widget mounts, opens, sends a message", async ({ page }) => {
		const requests = await mockWidgetApi(page, {
			firstReply: [
				JSON.stringify({ type: "delta", text: "Hello from the stub." }),
				JSON.stringify({ type: "done", elapsedMs: 1 }),
			],
		});
		await page.goto(WP);
		await expect(page.locator("pleiades-chat")).toHaveCount(1);
		await page.locator('[part="launcher"]').click();
		await page.locator('[part="input"]').fill("hi");
		await page.locator('[part="send"]').click();
		await expect(
			page.locator('[part="messages"] .message.assistant').last(),
		).toContainText("Hello from the stub.");
		expect(requests.some((r) => r.path === "messages")).toBe(true);
	});

	test("WebMCP tools are registered and open_page navigates", async ({
		page,
	}) => {
		await mockWidgetApi(page);
		await page.goto(WP);
		const names = await page.evaluate(async () => {
			const mc = (
				document as unknown as {
					modelContext: { getTools(): Promise<{ name: string }[]> };
				}
			).modelContext;
			return (await mc.getTools()).map((t) => t.name);
		});
		expect(names).toContain("open_page");
		expect(names).toContain("search_site");

		await Promise.all([
			page.waitForURL(/cart/),
			page.evaluate(async () => {
				const mc = (
					document as unknown as {
						modelContext: {
							getTools(): Promise<{ name: string }[]>;
							executeTool(t: unknown, args: string): Promise<unknown>;
						};
					}
				).modelContext;
				const tool = (await mc.getTools()).find((t) => t.name === "open_page");
				await mc.executeTool(
					tool,
					JSON.stringify({ url: `${location.origin}/cart/` }),
				);
			}),
		]);
		expect(page.url()).toContain("/cart");
	});

	test("localization settings reach the widget", async ({ page }) => {
		test.setTimeout(90_000);
		const before = wpcli(
			"option",
			"get",
			"pleiades_assistant",
			"--format=json",
		);
		const next = {
			...JSON.parse(before),
			lang: "en",
			l10n: { en: { heading: "E2E Heading", placeholder: "E2E placeholder" } },
		};
		wpcli(
			"option",
			"update",
			"pleiades_assistant",
			JSON.stringify(next),
			"--format=json",
		);
		try {
			await mockWidgetApi(page);
			await page.goto(WP);
			await page.locator('[part="launcher"]').click();
			await expect(page.locator("pleiades-chat")).toHaveAttribute(
				"heading",
				"E2E Heading",
			);
			await expect(page.locator('[part="input"]')).toHaveAttribute(
				"placeholder",
				"E2E placeholder",
			);
		} finally {
			wpcli("option", "update", "pleiades_assistant", before, "--format=json");
		}
	});
});

// Settings page tests share the option with the test above, so they live in this serial file.
const OPTION = "pleiades_assistant";
const SETTINGS = `${WP}/wp-admin/options-general.php?page=pleiades-chat`;
let before = "";

test.beforeAll(() => {
	before = wpcli("option", "get", OPTION, "--format=json");
});
test.afterAll(() => {
	if (before) wpcli("option", "update", OPTION, before, "--format=json");
});

async function login(page: Page) {
	await page.goto(`${WP}/wp-login.php`);
	await page.fill("#user_login", "admin");
	await page.fill("#user_pass", "admin");
	await page.click("#wp-submit");
	await page.waitForURL(/wp-admin/);
}

test.describe("plugin settings page", () => {
	test("General: tabs, buttons, panel link, no heading/greeting", async ({
		page,
	}) => {
		await login(page);
		await page.goto(SETTINGS);
		await expect(page.locator(".nav-tab")).toHaveCount(2);
		await expect(page.locator(".pleiades-links a.button")).toHaveCount(2);
		await expect(page.locator(".pleiades-links a.button-primary")).toHaveCount(
			1,
		);
		const panel = page.locator("td a[target=_blank]", {
			hasText: /panel|панел/i,
		});
		await expect(panel).toHaveAttribute("href", /pleiades-panel/);
		await expect(panel).toHaveAttribute("rel", "noopener noreferrer");
		await expect(page.locator('[name$="[heading]"]')).toHaveCount(0);
		await expect(page.locator('[name$="[greeting]"]')).toHaveCount(0);
	});

	test("Localization: every widget language, per-language overrides reach the widget", async ({
		page,
	}) => {
		test.setTimeout(90_000);
		await login(page);
		await page.goto(`${SETTINGS}&tab=localization`);
		const options = await page
			.locator("#pl-lang option")
			.evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
		expect(options).toEqual(["", "en", "ru", "kk"]);
		await page.selectOption("#pl-lang", "kk");
		await page.fill("#pl-l10n-kk-heading", "E2E Тақырып");
		await page.fill("#pl-l10n-kk-send", "E2E Жөнелту");
		await page.fill("#pl-l10n-ru-heading", "must not be printed");
		await expect(page.locator("#pl-l10n-kk-send")).toHaveAttribute(
			"placeholder",
			"Жіберу",
		);
		await page.click("#submit");
		await expect(page.locator("#pl-l10n-kk-send")).toHaveValue("E2E Жөнелту");

		await mockWidgetApi(page);
		await page.goto(WP);
		const chat = page.locator("pleiades-chat");
		await expect(chat).toHaveAttribute("lang", "kk");
		await expect(chat).toHaveAttribute("heading", "E2E Тақырып");
		await expect(chat).toHaveAttribute("labels", '{"send":"E2E Жөнелту"}');
	});
});
