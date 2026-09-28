import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { env } from "./env";
import { createHarness } from "./harness";
import { createPleiadesServer } from "./server";
import { parseSites } from "./sites";

const server = createPleiadesServer({
	sites: parseSites(env.PLEIADES_SITES),
	harness: createHarness({
		baseURL: env.HARNESS_BASE_URL,
		apiKey: env.HARNESS_API_KEY,
	}),
	userId: env.PLEIADES_MCP_USER,
});

// stdout is the MCP channel — log to stderr only.
await server.connect(new StdioServerTransport());
console.error("pleiades-mcp: ready");
