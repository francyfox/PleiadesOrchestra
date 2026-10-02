import { describe, expect, test } from "bun:test";
import {
	call,
	json,
	setRespond,
	signedIn,
	upstream,
	useHarness,
} from "../../app.harness.testing.ts";
import { describeTool } from "./mcp.service.ts";

useHarness();

describe("describeTool", () => {
	test("reads each parameter's type, description, enum and whether it is required", () => {
		const tool = describeTool({
			name: "search_products",
			description: "Search the catalog",
			inputSchema: {
				type: "object",
				required: ["query"],
				properties: {
					query: { type: "string", description: "Product words" },
					department: { type: "string", enum: ["Dairy", "Bakery"] },
					dietary: {
						type: "array",
						items: { type: "string", enum: ["vegan"] },
					},
					max_price: { type: "number" },
				},
			},
		});
		expect(tool).toEqual({
			name: "search_products",
			description: "Search the catalog",
			params: [
				{
					name: "query",
					type: "string",
					description: "Product words",
					required: true,
					values: null,
				},
				{
					name: "department",
					type: "string",
					description: null,
					required: false,
					values: ["Dairy", "Bakery"],
				},
				{
					name: "dietary",
					type: "string[]",
					description: null,
					required: false,
					values: ["vegan"],
				},
				{
					name: "max_price",
					type: "number",
					description: null,
					required: false,
					values: null,
				},
			],
		});
	});

	test("a tool without a schema, or with a strange one, simply has no parameters", () => {
		expect(describeTool({ name: "view_cart" }).params).toEqual([]);
		expect(describeTool({ name: "x", inputSchema: "nope" }).params).toEqual([]);
		expect(
			describeTool({ name: "y", inputSchema: { properties: { a: 5 } } }).params,
		).toEqual([
			{
				name: "a",
				type: null,
				description: null,
				required: false,
				values: null,
			},
		]);
	});
});

describe("GET /api/mcp", () => {
	test("is the orchestrator's list with every tool's parameters spelled out", async () => {
		const cookie = await signedIn();
		setRespond(() =>
			json({
				items: [
					{
						channelId: "c1",
						channelSlug: "shop",
						channelName: "Shop",
						toolCount: 1,
						firstSeenAt: 1,
						lastSeenAt: 2,
						registrations: 3,
						versions: 1,
						tools: [
							{
								name: "get_cart",
								description: "Show the cart",
							},
						],
					},
				],
			}),
		);

		const response = await call("/api/mcp", { cookie });

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			items: { tools: unknown[]; registrations: number }[];
		};
		expect(body.items[0]?.registrations).toBe(3);
		expect(body.items[0]?.tools).toEqual([
			{ name: "get_cart", description: "Show the cart", params: [] },
		]);
		expect(upstream[0]?.url).toContain("/v1/admin/mcp");
		expect((await call("/api/mcp")).status).toBe(401);
	});
});
