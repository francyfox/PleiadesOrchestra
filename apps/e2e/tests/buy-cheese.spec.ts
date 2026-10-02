import { expect, test } from "@playwright/test";

/**
 * The «купи 1 сыр» scenario through the real stack: the Basketful demo shop
 * (`apps/shopping-cart-webmcp`, vite on :5173, widget configured by its
 * `.env.local`) → widget → alpha-orchestrator → Laya picks the tools,
 * delta-function-call writes their arguments → the demo's real WebMCP tools
 * run in Chrome. Needs `docker compose up` and `bun run dev` of the demo, so it
 * is opt-in: `REAL_STACK=1 bunx playwright test buy-cheese`.
 */
test.skip(!process.env.REAL_STACK, "needs the real stack (set REAL_STACK=1)");

test.use({
	launchOptions: {
		args: [
			"--enable-features=WebMCP,WebModelContext",
			"--enable-experimental-web-platform-features",
		],
	},
});

const SHOP = process.env.SHOP_URL ?? "http://localhost:5173";

interface ToolCall {
	tool: string;
	arguments: Record<string, unknown>;
}

test("«купи 1 сыр» chooses a store, searches and adds cheese to the cart", async ({
	page,
}) => {
	test.setTimeout(180_000);

	const toolCalls: ToolCall[] = [];
	const steps: string[] = [];
	page.on("response", async (response) => {
		// A run is one stream per message plus one per tool result (resume).
		if (!/\/v1\/widget\/(messages|tool-results?)/.test(response.url())) return;
		const body = await response.text().catch(() => "");
		for (const line of body.split("\n")) {
			try {
				const event = JSON.parse(line) as {
					type?: string;
					tool?: string;
					arguments?: Record<string, unknown>;
					text?: string;
				};
				if (event.type === "tool_call" && event.tool) {
					toolCalls.push({
						tool: event.tool,
						arguments: event.arguments ?? {},
					});
				}
				if (event.type === "step" && event.text) steps.push(event.text);
			} catch {
				// not an NDJSON line
			}
		}
	});

	await page.goto(SHOP, { waitUntil: "domcontentloaded" });
	await expect
		.poll(() =>
			page.evaluate(
				async () =>
					(
						(await (
							document as unknown as {
								modelContext: { getTools(): Promise<{ name: string }[]> };
							}
						).modelContext.getTools()) ?? []
					).length,
			),
		)
		.toBeGreaterThan(0);

	await page.locator("pleiades-chat button").first().click();
	await page.locator("pleiades-chat textarea").fill("купи 1 сыр");
	await page.locator("pleiades-chat button[type=submit]").click();

	// The run pauses on every browser tool; wait until the reply is in.
	await expect
		.poll(() => toolCalls.map((call) => call.tool), { timeout: 120_000 })
		.toContain("add_to_cart");
	await page.waitForTimeout(5_000);

	console.log("tool calls:", JSON.stringify(toolCalls));
	console.log("steps:", JSON.stringify(steps));
	console.log(
		"panel:",
		await page
			.locator("pleiades-chat")
			.innerText()
			.catch(() => ""),
	);

	const search = toolCalls.find((call) => call.tool === "search_products");
	expect(String(search?.arguments.query ?? "").toLowerCase()).toContain(
		"cheese",
	);
	const add = toolCalls.find((call) => call.tool === "add_to_cart");
	expect(JSON.stringify(add?.arguments)).toMatch(/"quantity":1/);
});
