import { expect, type Page, test } from "@playwright/test";
import { cartCount, ok, skipUnlessWordPress, tool, WP } from "../support/wp";

/**
 * «Add a product that has variations» through the REAL stack: widget -> alpha-orchestrator (real
 * models) -> the plugin's tools on the real WooCommerce. Not the tool layer alone and not a scripted
 * agent: what the visitor sees. Opt-in: `REAL_STACK=1 bunx playwright test wordpress/real`
 * (needs `docker compose up` and `docker compose -f compose.wp.yml up`).
 */
test.skip(!process.env.REAL_STACK, "needs the real stack (set REAL_STACK=1)");
skipUnlessWordPress();

interface Event {
	type?: string;
	phase?: string;
	tool?: string;
	arguments?: Record<string, unknown>;
	text?: string;
}

/** Everything the orchestrator streamed to the widget so far, in order. */
function record(page: Page) {
	const events: Event[] = [];
	page.on("response", async (response) => {
		if (!/\/v1\/widget\/(messages|tool-results?)/.test(response.url())) return;
		const body = await response.text().catch(() => "");
		for (const line of body.split("\n")) {
			try {
				events.push(JSON.parse(line) as Event);
			} catch {
				// not an NDJSON line
			}
		}
	});
	return events;
}

const panel = (page: Page) => page.locator("pleiades-chat");

async function say(page: Page, text: string) {
	await panel(page).locator("textarea").fill(text);
	await panel(page).locator("button[type=submit]").click();
}

/** The turn is over when the stream says `done`/`error`/`cancelled` for it. */
const turnEnded = (events: Event[], from: number) =>
	events.slice(from).some((e) => e.type === "done" || e.type === "error");

test("a product with variations: the right product, its options listed, the answer completes the add", async ({
	page,
}) => {
	test.setTimeout(300_000);
	// The product's id from the shop itself, so the test cannot agree with a wrong pick.
	const [gown] = (await (
		await page.request.get(`${WP}/wp-json/wc/store/v1/products?search=Gown`)
	).json()) as { id: number; name: string }[];
	expect(gown?.name).toContain("Women");

	const events = record(page);
	await page.goto(WP);
	ok(await tool(page, "clear_cart", {}));
	await panel(page).locator("button").first().click();

	// Turn 1: a name with an apostrophe the shop stores differently.
	let mark = events.length;
	await say(page, "добавь в корзину Black Women's Gown");
	await expect
		.poll(() => turnEnded(events, mark), { timeout: 120_000 })
		.toBe(true);
	const first = events.slice(mark);
	const add = first.find(
		(e) => e.type === "tool_call" && e.tool === "add_to_cart",
	);
	console.log(
		"TURN 1:",
		JSON.stringify(
			first
				.filter((e) => e.type !== "delta")
				.map((e) => (e.type === "step" ? `${e.phase}: ${e.text}` : e)),
		),
	);
	expect(
		add?.arguments?.id,
		"the add targets the gown, not another black thing",
	).toBe(gown?.id);
	// The visitor is not sent to a page of some other search.
	expect(
		new URL(page.url()).searchParams.get("s") ?? "Black Women’s Gown",
	).toMatch(/Black Women/);
	expect(await cartCount(page)).toBe(0);
	const failed = first
		.filter((e) => e.type === "step" && e.phase === "failed")
		.map((e) => e.text ?? "");
	expect(failed.join(" ")).toMatch(/Color: Black, White/);
	expect(failed.join(" ")).toMatch(/Size: L, M, S, XL/);

	// Turn 2: the answer alone. What was asked has to carry over.
	mark = events.length;
	await say(page, "размер M, цвет чёрный");
	await expect
		.poll(() => turnEnded(events, mark), { timeout: 120_000 })
		.toBe(true);
	const second = events.slice(mark);
	console.log(
		"TURN 2:",
		JSON.stringify(
			second
				.filter((e) => e.type !== "delta")
				.map((e) => (e.type === "step" ? `${e.phase}: ${e.text}` : e)),
		),
	);
	const again = second.find(
		(e) => e.type === "tool_call" && e.tool === "add_to_cart",
	);
	expect(JSON.stringify(again?.arguments)).toMatch(
		new RegExp(`"id":${gown?.id}`),
	);
	expect(JSON.stringify(again?.arguments)).toMatch(/"M"/);
	expect(await cartCount(page)).toBe(1);

	// Turns 3 and 4: the added item is not a question, and what follows it must still be read on its own.
	mark = events.length;
	await say(page, "привет");
	await expect
		.poll(() => turnEnded(events, mark), { timeout: 120_000 })
		.toBe(true);
	const hello = events.slice(mark);
	console.log(
		"TURN 3:",
		JSON.stringify(
			hello
				.filter((e) => e.type !== "delta")
				.map((e) => (e.type === "step" ? `${e.phase}: ${e.text}` : e)),
		),
	);
	expect(hello.some((e) => e.type === "tool_call")).toBe(false);
	expect(await cartCount(page)).toBe(1);

	mark = events.length;
	await say(page, "найди сыр");
	await expect
		.poll(() => turnEnded(events, mark), { timeout: 120_000 })
		.toBe(true);
	const cheese = events.slice(mark);
	console.log(
		"TURN 4:",
		JSON.stringify(
			cheese
				.filter((e) => e.type !== "delta")
				.map((e) => (e.type === "step" ? `${e.phase}: ${e.text}` : e)),
		),
	);
	const search = cheese.find(
		(e) => e.type === "tool_call" && e.tool === "search_products",
	);
	expect(String(search?.arguments?.query ?? "").toLowerCase()).toMatch(
		/chees|сыр/,
	);
	expect(
		cheese.some((e) => e.type === "tool_call" && e.tool === "add_to_cart"),
	).toBe(false);
});
