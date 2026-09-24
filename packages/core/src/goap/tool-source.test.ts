import { describe, expect, test } from "bun:test";
import type { McpClient } from "./tool-source.ts";
import { createMcpToolSource } from "./tool-source.ts";

function fakeMcpClient(overrides: Partial<McpClient> = {}): McpClient & {
	calls: Array<{ name: string; arguments?: Record<string, unknown> }>;
} {
	const calls: Array<{ name: string; arguments?: Record<string, unknown> }> =
		[];
	return {
		calls,
		async listTools() {
			return {
				tools: [
					{
						name: "search_tickets",
						description: "Search for tickets",
						inputSchema: {
							type: "object",
							properties: {
								query: { type: "string" },
								city: { type: "string" },
							},
						},
					},
				],
			};
		},
		async callTool(params) {
			calls.push(params);
			return { content: [{ type: "text", text: "3 tickets found" }] };
		},
		...overrides,
	};
}

describe("createMcpToolSource", () => {
	test("turns each MCP tool into a GoapAction with the doc's default effects shape", async () => {
		const toolSource = createMcpToolSource({ client: fakeMcpClient() });
		const actions = await toolSource.listActions();

		expect(actions).toHaveLength(1);
		expect(actions[0]?.name).toBe("search_tickets");
		expect(actions[0]?.preconditions).toEqual({});
		expect(actions[0]?.effects).toEqual({ "toolResult:search_tickets": true });
	});

	test("builds call arguments automatically from world-state facts matching the tool's schema property names", async () => {
		const client = fakeMcpClient();
		const toolSource = createMcpToolSource({ client });
		const [action] = await toolSource.listActions();

		await action?.execute({
			state: { query: "concert", city: "Berlin", unrelated: "ignored" },
		});

		expect(client.calls).toEqual([
			{
				name: "search_tickets",
				arguments: { query: "concert", city: "Berlin" },
			},
		]);
	});

	test("maps a successful call into toolResult:<name> = true plus the joined text content", async () => {
		const toolSource = createMcpToolSource({ client: fakeMcpClient() });
		const [action] = await toolSource.listActions();

		const effects = await action?.execute({ state: {} });

		expect(effects).toEqual({
			"toolResult:search_tickets": true,
			"toolResult:search_tickets:text": "3 tickets found",
		});
	});

	test("maps a failed call (isError) into toolResult:<name> = false", async () => {
		const client = fakeMcpClient({
			async callTool() {
				return { content: [], isError: true };
			},
		});
		const toolSource = createMcpToolSource({ client });
		const [action] = await toolSource.listActions();

		const effects = await action?.execute({ state: {} });

		expect(effects).toEqual({ "toolResult:search_tickets": false });
	});

	test("uses a caller-supplied costFor, falling back to a default when not given", async () => {
		const withDefault = createMcpToolSource({ client: fakeMcpClient() });
		const [defaultAction] = await withDefault.listActions();
		expect(defaultAction?.cost).toBeGreaterThan(0);

		const withCustom = createMcpToolSource({
			client: fakeMcpClient(),
			costFor: () => 42,
		});
		const [customAction] = await withCustom.listActions();
		expect(customAction?.cost).toBe(42);
	});
});
