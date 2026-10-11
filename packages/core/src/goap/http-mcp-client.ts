import type { McpCallToolResult, McpClient, McpToolDescriptor } from "./tool-source";

interface RpcResponse {
	result?: unknown;
	error?: { code: number; message: string };
}

/**
 * Connects to a remote MCP server over HTTP (Streamable HTTP transport,
 * MCP spec 2024-11-05). The server must expose a single POST endpoint that
 * accepts JSON-RPC 2.0 and returns JSON — exactly the format kali-mcp uses.
 *
 * Returns the same narrow `McpClient` port as `connectStdioMcpClient`, so
 * `createMcpToolSource` works with it without changes.
 */
export async function connectHttpMcpClient(url: string): Promise<McpClient> {
	let nextId = 1;

	async function rpc(method: string, params?: unknown): Promise<unknown> {
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: nextId++,
				method,
				params: params ?? {},
			}),
		});

		if (!res.ok) {
			throw new Error(`kali-mcp HTTP ${res.status}: ${await res.text()}`);
		}

		const json = (await res.json()) as RpcResponse;
		if (json.error) throw new Error(`kali-mcp RPC error: ${json.error.message}`);
		return json.result;
	}

	// MCP handshake — required before any other call
	await rpc("initialize", {
		protocolVersion: "2024-11-05",
		capabilities: {},
		clientInfo: { name: "pleiades-alpha", version: "1.0.0" },
	});

	return {
		async listTools(): Promise<{ tools: McpToolDescriptor[] }> {
			return rpc("tools/list") as Promise<{ tools: McpToolDescriptor[] }>;
		},

		async callTool(params: {
			name: string;
			arguments?: Record<string, unknown>;
		}): Promise<McpCallToolResult> {
			return rpc("tools/call", params) as Promise<McpCallToolResult>;
		},
	};
}
