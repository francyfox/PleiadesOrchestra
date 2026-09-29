import { afterEach, describe, expect, test } from "bun:test";
import { createNavigatorWebMcpProvider } from "./webmcp";

afterEach(() => {
	(globalThis as { document?: unknown }).document = undefined;
});

describe("createNavigatorWebMcpProvider", () => {
	test("returns undefined when neither navigator nor document expose a modelContext", () => {
		expect(createNavigatorWebMcpProvider()).toBeUndefined();
	});

	test("returns undefined when modelContext is present but lacks getTools/executeTool (e.g. only registerTool — the site's own provider side)", () => {
		(globalThis as { document?: unknown }).document = {
			modelContext: { registerTool: () => {} },
		};
		expect(createNavigatorWebMcpProvider()).toBeUndefined();
	});

	test("listTools maps the real getTools() shape, parsing a stringified inputSchema", async () => {
		(globalThis as { document?: unknown }).document = {
			modelContext: {
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
						{ name: "get_cart", inputSchema: { type: "object" } },
					];
				},
				async executeTool() {
					throw new Error("not called in this test");
				},
			},
		};

		const provider = createNavigatorWebMcpProvider();
		const tools = await provider?.listTools();

		expect(tools).toEqual([
			{
				name: "search_products",
				description: "Search the catalog",
				inputSchema: { type: "object", properties: { query: {} } },
			},
			{
				name: "get_cart",
				description: undefined,
				inputSchema: { type: "object" },
			},
		]);
	});

	test("callTool re-fetches getTools(), finds the tool by name, and calls executeTool(tool, JSON-string args)", async () => {
		let capturedTool: unknown;
		let capturedArgs: unknown;
		(globalThis as { document?: unknown }).document = {
			modelContext: {
				async getTools() {
					return [{ name: "add_to_cart", inputSchema: { type: "object" } }];
				},
				async executeTool(tool: unknown, argsJson: string) {
					capturedTool = tool;
					capturedArgs = JSON.parse(argsJson);
					return JSON.stringify({
						content: [{ type: "text", text: "added" }],
					});
				},
			},
		};

		const provider = createNavigatorWebMcpProvider();
		const outcome = await provider?.callTool("add_to_cart", {
			itemId: "sku-1",
		});

		expect(capturedTool).toMatchObject({ name: "add_to_cart" });
		expect(capturedArgs).toEqual({ itemId: "sku-1" });
		expect(outcome).toEqual({
			result: { content: [{ type: "text", text: "added" }] },
			isError: false,
		});
	});

	test("callTool surfaces isError from a JSON-string executeTool result", async () => {
		(globalThis as { document?: unknown }).document = {
			modelContext: {
				async getTools() {
					return [{ name: "checkout" }];
				},
				async executeTool() {
					return JSON.stringify({
						content: [{ type: "text", text: "card declined" }],
						isError: true,
					});
				},
			},
		};

		const provider = createNavigatorWebMcpProvider();
		const outcome = await provider?.callTool("checkout", {});

		expect(outcome?.isError).toBe(true);
	});

	test("callTool reports a clean error instead of throwing when the tool isn't registered (page state changed)", async () => {
		(globalThis as { document?: unknown }).document = {
			modelContext: {
				async getTools() {
					return [];
				},
				async executeTool() {
					throw new Error("should not be called");
				},
			},
		};

		const provider = createNavigatorWebMcpProvider();
		const outcome = await provider?.callTool("gone", {});

		expect(outcome?.isError).toBe(true);
	});
});
