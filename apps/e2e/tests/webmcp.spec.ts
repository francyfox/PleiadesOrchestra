import { expect, test } from "@playwright/test";
import { mockWidgetApi } from "./widget-api-mock";

/**
 * Regression coverage for the bug this suite exists because of: the widget's
 * `createNavigatorWebMcpProvider()` (lib/webmcp.ts) detected a real
 * `document.modelContext` by checking for a `callTool` method that the real
 * WebMCP spec doesn't have (the real methods are `getTools`/`executeTool` —
 * confirmed against `apps/shopping-cart-webmcp`'s own working caller,
 * `skills/grocery-staples/scripts/webmcp-bridge.js`). That check always
 * failed, so the provider was always `undefined` and WebMCP silently never
 * worked, even with a fully working browser extension present. `bun:test`
 * has no DOM, so nothing exercising the real `navigator`/`document` global
 * ever caught this — that's what these tests are for.
 */
test.describe("WebMCP round trip", () => {
	test("detects document.modelContext, asks for a tool call on tool_call, executes it, and resumes to the reply", async ({
		page,
	}) => {
		await page.addInitScript(() => {
			(window as unknown as { __toolCalls: unknown[] }).__toolCalls = [];
			(document as unknown as { modelContext: unknown }).modelContext = {
				async getTools() {
					return [
						{
							name: "search_products",
							description: "Search the catalog",
							inputSchema: JSON.stringify({
								type: "object",
								properties: { query: {} },
							}),
						},
					];
				},
				async executeTool(tool: { name: string }, argsJson: string) {
					(
						window as unknown as {
							__toolCalls: { tool: string; args: unknown }[];
						}
					).__toolCalls.push({ tool: tool.name, args: JSON.parse(argsJson) });
					return JSON.stringify({
						content: [{ type: "text", text: "found 3 laptops" }],
					});
				},
			};
		});

		const requests = await mockWidgetApi(page, {
			firstReply: [
				JSON.stringify({
					type: "tool_call",
					tool: "search_products",
					arguments: { query: "laptop" },
					callId: "call-1",
				}),
			],
			toolResultReply: [
				JSON.stringify({ type: "delta", text: "Found 3 laptops for you." }),
				JSON.stringify({ type: "done", elapsedMs: 5 }),
			],
		});

		await page.goto("/widget.html");
		await page.locator('[part="input"]').fill("find a laptop");
		await page.locator('[part="send"]').click();

		await expect(
			page.locator('[part="messages"] .message.assistant').last(),
		).toHaveText("Found 3 laptops for you.");

		const toolCalls = await page.evaluate(
			() => (window as unknown as { __toolCalls: unknown[] }).__toolCalls,
		);
		expect(toolCalls).toEqual([
			{ tool: "search_products", args: { query: "laptop" } },
		]);

		// Registered once, via /v1/widget/tools when the panel opens — not
		// resent with the message body (that's what caused the 413 this test
		// would otherwise miss: see docs/laya-autonomous-webmcp.md).
		const toolsRequests = requests.filter((r) => r.path === "tools");
		expect(toolsRequests).toHaveLength(1);
		expect(toolsRequests[0]?.body).toMatchObject({
			webmcpTools: [{ name: "search_products" }],
		});

		const messagesRequest = requests.find((r) => r.path === "messages");
		expect(messagesRequest?.body).not.toHaveProperty("webmcpTools");

		const resumeRequest = requests.find((r) => r.path === "tool-results");
		expect(resumeRequest?.body).toMatchObject({
			tool: "search_products",
			callId: "call-1",
		});
		// api.ts omits `isError` from the body entirely when false (same
		// minimal-payload convention as `customerContext`/`webmcpTools`) —
		// the server defaults a missing field to `false` (`modules/widget/widget.ts`).
		expect(
			(resumeRequest?.body as { isError?: unknown } | undefined)?.isError,
		).toBeFalsy();
	});

	test("a tool_call with no document.modelContext in the page fails cleanly instead of hanging", async ({
		page,
	}) => {
		// No addInitScript here — a plain browser, matching every real one today.
		await mockWidgetApi(page, {
			firstReply: [
				JSON.stringify({
					type: "tool_call",
					tool: "search_products",
					arguments: {},
					callId: "call-1",
				}),
			],
		});

		await page.goto("/widget.html");
		await page.locator('[part="input"]').fill("find a laptop");
		await page.locator('[part="send"]').click();

		// chat.ts's ChatError "failed" — no assistant bubble is left hanging in
		// the typing state, and the composer is usable again for a new
		// message (not stuck disabled/busy forever). The button being
		// disabled right after send is expected: `composer.tsx` clears the
		// textarea on submit, and an empty textarea disables send — that's
		// not what this test is checking.
		await expect(page.locator('[part="messages"] .typing')).toHaveCount(0);
		await page.locator('[part="input"]').fill("try again");
		await expect(page.locator('[part="send"]')).toBeEnabled();
	});

	test("without a document.modelContext at all, no /v1/widget/tools call is ever made, and a plain reply still works", async ({
		page,
	}) => {
		// No addInitScript — matches every real browser today.
		const requests = await mockWidgetApi(page, {
			firstReply: [
				JSON.stringify({ type: "delta", text: "Hi there!" }),
				JSON.stringify({ type: "done", elapsedMs: 3 }),
			],
		});

		await page.goto("/widget.html");
		await page.locator('[part="input"]').fill("hello");
		await page.locator('[part="send"]').click();

		await expect(
			page.locator('[part="messages"] .message.assistant').last(),
		).toHaveText("Hi there!");

		// Nothing was ever registered, so nothing to send or clear — skipping
		// the call entirely (not registering an empty catalog) avoids a
		// pointless network round trip on every single panel open.
		expect(requests.some((r) => r.path === "tools")).toBe(false);
	});

	test("a large, realistic tool catalog (like a real shop's) registers fine and never inflates a message body", async ({
		page,
	}) => {
		// Roughly what apps/shopping-cart-webmcp actually has: ~15 tools with
		// real descriptions/schemas — several kB, comfortably over
		// WIDGET_MAX_TEXT_CHARS (2000, the limit that used to apply here when
		// the catalog rode along with every message) but under
		// WIDGET_MAX_WEBMCP_TOOLS_CHARS (20000, the dedicated /v1/widget/tools
		// limit).
		await page.addInitScript(() => {
			const tools = Array.from({ length: 15 }, (_, index) => ({
				name: `tool_${index}`,
				description:
					"A reasonably detailed description of what this tool does, ".repeat(
						8,
					),
				inputSchema: JSON.stringify({
					type: "object",
					properties: { query: { type: "string" }, limit: { type: "number" } },
				}),
			}));
			(document as unknown as { modelContext: unknown }).modelContext = {
				async getTools() {
					return tools;
				},
				async executeTool() {
					return JSON.stringify({ content: [{ type: "text", text: "ok" }] });
				},
			};
		});

		const requests = await mockWidgetApi(page, {
			firstReply: [
				JSON.stringify({ type: "delta", text: "Hi there!" }),
				JSON.stringify({ type: "done", elapsedMs: 3 }),
			],
		});

		await page.goto("/widget.html");
		await page.locator('[part="input"]').fill("hello");
		await page.locator('[part="send"]').click();

		await expect(
			page.locator('[part="messages"] .message.assistant').last(),
		).toHaveText("Hi there!");

		const toolsRequest = requests.find((r) => r.path === "tools");
		const catalogSize = JSON.stringify(
			(toolsRequest?.body as { webmcpTools?: unknown[] } | undefined)
				?.webmcpTools,
		).length;
		expect(catalogSize).toBeGreaterThan(2000);

		const messagesRequest = requests.find((r) => r.path === "messages");
		expect(JSON.stringify(messagesRequest?.body).length).toBeLessThan(200);
	});
});
