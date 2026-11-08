import { expect, type Page, test } from "@playwright/test";
import {
	type Ctx,
	fakeAgent,
	type Script,
	type Step,
} from "../support/fake-agent";
import { cartCount, skipUnlessWordPress, WP } from "../support/wp";

/**
 * Multi-step flows on the real local WordPress + WooCommerce (compose.wp.yml,
 * plugin active): the real widget, the real WebMCP tools of the plugin, real
 * cart, real full page reloads. Only the agent is scripted (`fake-agent.ts`),
 * because the models are not reachable from a dev machine; so it checks the
 * client paths, not the planner's choice for a prompt. Skipped when WP is down.
 */
skipUnlessWordPress();

const search = (query: string): Step => ({
	tool: "search_products",
	args: () => ({ query }),
});
const open = (path: string): Step => ({
	tool: "open_page",
	args: () => ({ url: `${WP}${path}` }),
});
const addLast: Step = {
	tool: "add_to_cart",
	args: (c) => ({ id: c.lastProduct?.id, quantity: 1 }),
};
const say = (text: string): Step => ({
	reply: (c: Ctx) =>
		`${text}${c.lastProduct ? ` [${c.lastProduct.name}]` : ""}`,
});

async function ask(page: Page, text: string) {
	const panel = page.locator('[part="input"]');
	if (!(await panel.isVisible()))
		await page.locator('[part="launcher"]').click();
	await panel.fill(text);
	await page.locator('[part="send"]').click();
}
const lastReply = (page: Page) =>
	page.locator('[part="messages"] .message.assistant').last();
interface Row {
	name: string;
	prompts: { text: string; steps: Step[]; reply: RegExp }[];
	url?: RegExp;
	cart?: number;
}

// Varied shop wording, EN and RU. The sample store sells cosmetics and perfume.
const rows: Row[] = [
	{
		name: "EN find a product (no reload)",
		prompts: [
			{
				text: "do you guys carry any lipstick?",
				steps: [search("lipstick"), say("Yes, I found")],
				reply: /\[Red Lipstick\]/,
			},
		],
		url: /post_type=product|\/product\/red-lipstick\//, // search_products also opens the shop page
		cart: 0,
	},
	{
		name: "RU find a product (no reload)",
		prompts: [
			{
				text: "есть тушь для ресниц?",
				steps: [search("mascara"), say("Нашла")],
				reply: /Нашла \[Essence Mascara/,
			},
		],
		cart: 0,
	},
	{
		name: "EN open a product page (reload)",
		prompts: [
			{
				text: "show me the page of the Dior perfume",
				steps: [
					search("dior"),
					open("/product/dior-jadore/"),
					say("Here it is"),
				],
				reply: /Here it is/,
			},
		],
		url: /\/product\/dior-jadore\/$/,
	},
	{
		name: "RU show cart (reload)",
		prompts: [
			{
				text: "покажи корзину",
				steps: [open("/cart/"), say("Вот корзина")],
				reply: /Вот корзина/,
			},
		],
		url: /\/cart\/$/,
	},
	{
		name: "EN go to checkout (reload; an empty cart would bounce to /cart/)",
		prompts: [
			{
				text: "grab the dior perfume and take me to checkout",
				steps: [
					search("dior"),
					addLast,
					open("/checkout/"),
					say("You are at checkout"),
				],
				reply: /at checkout/,
			},
		],
		url: /\/checkout\/$/,
		cart: 1,
	},
	{
		name: "EN search then add to cart",
		prompts: [
			{
				text: "put a red nail polish into my basket",
				steps: [search("nail polish"), addLast, say("Added")],
				reply: /Added \[Red Nail Polish\]/,
			},
		],
		cart: 1,
	},
	{
		name: "EN bare follow-up: 'buy it' after a search",
		prompts: [
			{
				text: "find the eyeshadow palette",
				steps: [search("eyeshadow"), say("Found")],
				reply: /Found \[Eyeshadow/,
			},
			// the planner would resolve "it" from the lastProduct fact; the fake does the same
			{ text: "buy it", steps: [addLast, say("Bought")], reply: /Bought/ },
		],
		cart: 1,
	},
	{
		name: "RU bare follow-up: 'купи' after a search",
		prompts: [
			{
				text: "найди красную помаду",
				steps: [search("lipstick"), say("Нашла")],
				reply: /Нашла/,
			},
			{ text: "купи", steps: [addLast, say("Готово")], reply: /Готово/ },
		],
		cart: 1,
	},
	{
		name: "EN add then open cart (write, then reload, then reply)",
		prompts: [
			{
				text: "add the mascara and show me my cart",
				steps: [
					search("mascara"),
					addLast,
					open("/cart/"),
					say("Your cart is open"),
				],
				reply: /Your cart is open/,
			},
		],
		url: /\/cart\/$/,
		cart: 1,
	},
];

test.describe("WordPress flows through the widget (scripted agent)", () => {
	for (const row of rows) {
		test(row.name, async ({ page }) => {
			const script: Script = (text) => {
				const p = row.prompts.find((x) => x.text === text);
				return p ? p.steps : [say(`? ${text}`)];
			};
			await fakeAgent(page, script);
			await page.goto(WP);
			for (const p of row.prompts) {
				await ask(page, p.text);
				await expect(lastReply(page)).toContainText(p.reply, {
					timeout: 15_000,
				});
			}
			// a tool may navigate right after the turn ends
			await page.waitForTimeout(400);
			await page.waitForLoadState("load");
			if (row.url) await expect(page).toHaveURL(row.url);
			if (row.cart !== undefined) expect(await cartCount(page)).toBe(row.cart);
		});
	}
});

// What a full reload does to a turn. open_page is a write tool and the page dies right after it returns,
// so the stream that carries the NEXT step (the tool-result response) belongs to a dead page.
// Latency 2.5 s stands for the planner/model call between the tool result and the next step.
// The plugin holds the navigation until the widget's turn ends (`pleiades:turn-end`), so the next step still arrives.
test.describe("open_page reload and the pending turn", () => {
	const SLOW = { latencyMs: 2500 };
	const notice = (page: Page) => page.locator('[part="notice"]');

	test("the reply after a last-step open_page reaches the new page", async ({
		page,
	}) => {
		await fakeAgent(page, () => [open("/cart/"), say("Cart is open")], SLOW);
		await page.goto(WP);
		await ask(page, "show my cart please");
		await expect(page).toHaveURL(/\/cart\/$/);
		await expect(lastReply(page)).toContainText("Cart is open", {
			timeout: 6000,
		});
	});

	test("two open_page calls in one turn: only the last page loads, the turn completes", async ({
		page,
	}) => {
		await fakeAgent(
			page,
			() => [open("/product/dior-jadore/"), open("/cart/"), say("Both done")],
			SLOW,
		);
		await page.goto(WP);
		await ask(page, "open the dior page, then my cart");
		await expect(page).toHaveURL(/\/cart\/$/, { timeout: 12_000 });
		await expect(lastReply(page)).toContainText("Both done", { timeout: 8000 });
	});

	test("tool result cancelled by the reload: pending asks to continue", async ({
		page,
	}) => {
		const agent = await fakeAgent(
			page,
			() => [open("/cart/"), say("Cart is open")],
			{ dropToolResultFor: "open_page" },
		);
		await page.goto(WP);
		await ask(page, "show my cart please");
		await expect(page).toHaveURL(/\/cart\/$/);
		await expect(notice(page)).toBeVisible({ timeout: 6000 });
		await expect(notice(page)).toContainText("Continue");
		expect(agent.toolResults).toEqual([]);
	});
});
