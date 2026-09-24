import { describe, expect, test } from "bun:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { createMcpToolSource } from "./tool-source.ts";

/**
 * Unlike tool-source.test.ts (which fakes `McpClient`), this drives a real
 * `@modelcontextprotocol/server` `McpServer` over a real (in-process)
 * transport pair — a genuine MCP `tools/list`/`tools/call` round-trip, per
 * the plan doc's "подключение к одному реальному MCP-серверу". No stdio
 * subprocess needed for that: `InMemoryTransport` is the SDK's own
 * reference transport for exactly this kind of test.
 */
describe("createMcpToolSource against a real MCP server", () => {
	test("lists and executes a real server's tool end to end", async () => {
		const server = new McpServer(
			{ name: "test-server", version: "1.0.0" },
			{ capabilities: {} },
		);

		server.registerTool(
			"echo_city",
			{
				description: "Echoes the given city back",
				inputSchema: fromJsonSchema({
					type: "object",
					properties: { city: { type: "string" } },
				}),
			},
			async (args) => ({
				content: [
					{
						type: "text",
						text: `you said: ${(args as { city?: string }).city}`,
					},
				],
			}),
		);

		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		const client = new Client({ name: "test-client", version: "1.0.0" });

		await server.server.connect(serverTransport);
		await client.connect(clientTransport);

		const toolSource = createMcpToolSource({ client });
		const actions = await toolSource.listActions();

		expect(actions).toHaveLength(1);
		expect(actions[0]?.name).toBe("echo_city");
		expect(actions[0]?.effects).toEqual({ "toolResult:echo_city": true });

		const effects = await actions[0]?.execute({ state: { city: "Berlin" } });

		expect(effects).toEqual({
			"toolResult:echo_city": true,
			"toolResult:echo_city:text": "you said: Berlin",
		});
	});
});
