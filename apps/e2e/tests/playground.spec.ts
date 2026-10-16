import { expect, type Page, test } from "@playwright/test";
import {
	demoUrl,
	PLAYGROUND_DEMOS,
	type PlaygroundDemo,
} from "./playground-demos";
import { mockWidgetApi, type RecordedRequest } from "./widget-api-mock";

/**
 * The docs playground (`apps/docs` build on :4311, see playwright.config.ts):
 * a demo shop in an iframe next to the <pleiades-chat> widget. The orchestrator
 * is mocked (`page.route` on the fake agent origin the site was built with), so
 * these tests check what the widget announces for each demo, not what a model
 * does with it — the real-stack scenarios are in playground-real.spec.ts.
 */
const PLAYGROUND = "http://localhost:4311/playground/";

interface ToolsBody {
	threadId: string;
	webmcpTools: { name: string }[];
}

const toolsRequests = (requests: RecordedRequest[]) =>
	requests
		.filter((r) => r.path === "tools")
		.map((r) => ({ headers: r.headers, body: r.body as ToolsBody }));

/** The names of the newest non-empty catalog registered so far (a switch first announces `[]`). */
const latestCatalog = (requests: RecordedRequest[]) => {
	const filled = toolsRequests(requests).filter(
		(r) => r.body.webmcpTools.length > 0,
	);
	const last = filled[filled.length - 1];
	return last ? last.body.webmcpTools.map((t) => t.name) : [];
};

async function openPlayground(page: Page) {
	await page.goto(PLAYGROUND);
	await expect(page.locator("pleiades-chat textarea")).toBeVisible();
}

async function selectDemo(page: Page, demo: PlaygroundDemo) {
	await page.locator("select.demo-select").selectOption(demoUrl(demo));
}

test.describe("playground: the widget announces each demo's own tools", () => {
	for (const demo of PLAYGROUND_DEMOS) {
		test(`${demo.name}: catalog is exactly the demo's tools`, async ({
			page,
		}) => {
			const requests = await mockWidgetApi(page);
			await openPlayground(page);
			await selectDemo(page, demo);

			// Some demos register their tools seconds after the iframe loads.
			await expect
				.poll(() => latestCatalog(requests).sort(), { timeout: 20_000 })
				.toEqual([...demo.tools].sort());

			// Every other demo's tools are absent from the catalog.
			const others = PLAYGROUND_DEMOS.filter((d) => d !== demo).flatMap(
				(d) => d.tools,
			);
			expect(latestCatalog(requests).filter((n) => others.includes(n))).toEqual(
				[],
			);
		});

		test(`${demo.name}: the visitor is created with the demo's publishable key`, async ({
			page,
		}) => {
			const requests = await mockWidgetApi(page);
			await openPlayground(page);
			await selectDemo(page, demo);
			await expect
				.poll(() => latestCatalog(requests).length, { timeout: 20_000 })
				.toBeGreaterThan(0);

			const keys = requests
				.filter((r) => r.path === "visitors")
				.map((r) => r.headers["x-publishable-key"]);
			// A shared-key demo reuses the visitor made on page load; an own-key
			// demo makes a new one on its own channel.
			expect(keys.at(-1)).toBe(demo.key);
		});
	}
});

test("shared key: switching demos starts a new thread for the same visitor", async ({
	page,
}) => {
	const [first, second] = PLAYGROUND_DEMOS.filter(
		(d) => d.key === PLAYGROUND_DEMOS[0]?.key,
	);
	if (!first || !second) throw new Error("need two shared-key demos");

	const requests = await mockWidgetApi(page);
	await openPlayground(page);
	await expect
		.poll(() => latestCatalog(requests).sort(), { timeout: 20_000 })
		.toEqual([...first.tools].sort());
	const firstThread = toolsRequests(requests).at(-1)?.body.threadId;

	await selectDemo(page, second);
	await expect
		.poll(() => latestCatalog(requests).sort(), { timeout: 20_000 })
		.toEqual([...second.tools].sort());

	const threads = requests.filter((r) => r.path === "threads");
	expect(threads).toHaveLength(2);
	expect(threads[1]?.headers["x-visitor-token"]).toBe(
		threads[0]?.headers["x-visitor-token"],
	);
	// One visitor for both demos: the second demo did not sign up again.
	expect(requests.filter((r) => r.path === "visitors")).toHaveLength(1);

	// The second demo's tools went to the new thread, not to the first one.
	const last = toolsRequests(requests).at(-1);
	expect(last?.body.threadId).not.toBe(firstThread);
	expect(last?.body.threadId).toBe("thread-e2e-2");
});

test("back to the shared key from an own-key demo starts a new shared thread", async ({
	page,
}) => {
	const sharedKey = PLAYGROUND_DEMOS[0]?.key;
	const [first, second] = PLAYGROUND_DEMOS.filter((d) => d.key === sharedKey);
	const own = PLAYGROUND_DEMOS.find((d) => d.key !== sharedKey);
	if (!first || !second || !own) throw new Error("need shared and own demos");

	const requests = await mockWidgetApi(page);
	await openPlayground(page);
	await expect
		.poll(() => latestCatalog(requests).sort(), { timeout: 20_000 })
		.toEqual([...first.tools].sort());
	const firstThread = toolsRequests(requests).at(-1)?.body.threadId;

	await selectDemo(page, own);
	await expect
		.poll(() => latestCatalog(requests).sort(), { timeout: 20_000 })
		.toEqual([...own.tools].sort());

	// The key changes and the session resets in the same tick: the reset must
	// land on the shared channel, not on the own-key chat being replaced.
	await selectDemo(page, second);
	await expect
		.poll(() => latestCatalog(requests).sort(), { timeout: 20_000 })
		.toEqual([...second.tools].sort());
	const last = toolsRequests(requests).at(-1);
	expect(last?.headers["x-visitor-token"]).toBeDefined();
	expect(last?.body.threadId).not.toBe(firstThread);
});

test("per-demo keys: every demo talks on its own channel", async ({ page }) => {
	const own = PLAYGROUND_DEMOS.filter(
		(d) => d.key !== PLAYGROUND_DEMOS[0]?.key,
	);
	expect(own.length).toBeGreaterThanOrEqual(2);

	const requests = await mockWidgetApi(page);
	await openPlayground(page);
	for (const demo of own) {
		await selectDemo(page, demo);
		await expect
			.poll(
				() =>
					requests
						.filter((r) => r.path === "visitors")
						.map((r) => r.headers["x-publishable-key"])
						.includes(demo.key),
				{ timeout: 20_000 },
			)
			.toBe(true);
		await expect
			.poll(() => latestCatalog(requests).sort(), { timeout: 20_000 })
			.toEqual([...demo.tools].sort());
	}
	// Distinct keys were used, never one demo's key for the other's visitor.
	const keys = requests
		.filter((r) => r.path === "visitors")
		.map((r) => r.headers["x-publishable-key"]);
	for (const demo of own)
		expect(keys.filter((k) => k === demo.key)).toHaveLength(1);
});
