import { expect, test } from "@playwright/test";
import {
	demoUrl,
	PLAYGROUND_DEMOS,
	type PlaygroundDemo,
} from "./playground-demos";

/**
 * One short scenario per playground demo through the real stack: demo iframe →
 * widget → alpha-orchestrator → Laya/delta → the first tool the model picks.
 * Opt-in like buy-cheese: needs `docker compose up` and the docs site built or
 * served with real publishable keys (`bun --cwd apps/docs run dev` on :3004
 * reads apps/docs/.env), then
 * `REAL_STACK=1 bunx playwright test playground-real`.
 */
test.skip(!process.env.REAL_STACK, "needs the real stack (set REAL_STACK=1)");

const PLAYGROUND =
	process.env.PLAYGROUND_URL ?? "http://localhost:3004/playground/";

interface Scenario {
	demo: string;
	message: string;
	/** The tool the run must call first. */
	firstTool: string;
	/** Known failure: the GitHub issue behind it. */
	knownFailure?: string;
}

const SCENARIOS: Scenario[] = [
	{ demo: "basketful", message: "купи 1 сыр", firstTool: "add_to_cart" },
	{
		demo: "pizza-maker",
		message: "увеличь размер пиццы",
		firstTool: "set_pizza_size",
		// PO-41: the hard-coded shop intent taxonomy sends this to add_topping.
		knownFailure: "PO-41",
	},
	{
		demo: "explainer",
		message: "which consultation times are free this week",
		firstTool: "getAvailability",
	},
	{
		demo: "react-flightsearch",
		message: "find flights from London to Paris",
		firstTool: "searchFlights",
	},
	{
		demo: "ticket-booking",
		message: "show me horror movies",
		firstTool: "query_content",
	},
	{
		demo: "hotel-chain",
		message: "find hotels in Paris",
		firstTool: "search_location",
	},
];

for (const scenario of SCENARIOS) {
	const demo = PLAYGROUND_DEMOS.find(
		(d) => d.dir === scenario.demo,
	) as PlaygroundDemo;

	test(`${demo.name}: «${scenario.message}» -> ${scenario.firstTool}`, async ({
		page,
	}) => {
		test.setTimeout(180_000);
		if (scenario.knownFailure) test.fail(true, scenario.knownFailure);

		const toolCalls: string[] = [];
		page.on("response", async (response) => {
			if (!/\/v1\/widget\/(messages|tool-results?)/.test(response.url()))
				return;
			const body = await response.text().catch(() => "");
			for (const line of body.split("\n")) {
				try {
					const event = JSON.parse(line) as { type?: string; tool?: string };
					if (event.type === "tool_call" && event.tool)
						toolCalls.push(event.tool);
				} catch {
					// not an NDJSON line
				}
			}
		});
		const registered: string[][] = [];
		page.on("request", (request) => {
			if (!request.url().endsWith("/v1/widget/tools")) return;
			const body = request.postDataJSON() as {
				webmcpTools?: { name: string }[];
			};
			registered.push((body.webmcpTools ?? []).map((t) => t.name));
		});

		await page.goto(PLAYGROUND, { waitUntil: "domcontentloaded" });
		await page.locator("select.demo-select").selectOption(demoUrl(demo));
		// Wait until the server knows this demo's tools (they can register late).
		await expect
			.poll(() => registered.at(-1) ?? [], { timeout: 30_000 })
			.toContain(scenario.firstTool);

		await page.locator("pleiades-chat textarea").fill(scenario.message);
		await page.locator("pleiades-chat button[type=submit]").click();

		await expect
			.poll(() => toolCalls.length, { timeout: 120_000 })
			.toBeGreaterThan(0);
		console.log(`${demo.name} tool calls:`, JSON.stringify(toolCalls));
		// «reaches» for multi-step shops (basketful picks a store and searches
		// first); every other demo's first call is the answer.
		if (scenario.demo === "basketful") {
			await expect
				.poll(() => toolCalls, { timeout: 120_000 })
				.toContain(scenario.firstTool);
		} else {
			expect(toolCalls[0]).toBe(scenario.firstTool);
		}
	});
}
