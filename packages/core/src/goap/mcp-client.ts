import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { McpClient } from "./tool-source";

export interface StdioMcpClientConfig {
	/** Identity this client announces to the server — cosmetic, shows up in the server's own logs, not a secret. */
	name: string;
	version: string;
	command: string;
	args?: string[];
}

/**
 * Connects to a real MCP server over stdio (a local child process) and
 * returns it typed as our narrow `McpClient` port (`tool-source.ts`) — the
 * concrete `@modelcontextprotocol/client` `Client` class structurally
 * satisfies that port already; this just bundles "construct client +
 * transport + connect" into the one call a real caller (Phase 5's
 * `apps/alpha-orchestrator` wiring) actually wants.
 */
export async function connectStdioMcpClient(
	config: StdioMcpClientConfig,
): Promise<McpClient> {
	const client = new Client({ name: config.name, version: config.version });
	const transport = new StdioClientTransport({
		command: config.command,
		args: config.args,
	});
	await client.connect(transport);
	return client;
}
