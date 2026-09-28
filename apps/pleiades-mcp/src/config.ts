import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function buildConfig(env: Record<string, string | undefined>) {
	return createEnv({
		server: {
			HARNESS_BASE_URL: z.url().default("http://localhost:3000"),
			HARNESS_API_KEY: z.string().min(1),
			// `slug=host,slug2=host2` — the sites this server may talk about (see sites.ts).
			PLEIADES_SITES: z.string().default(""),
			// External user id the orchestrator sees for every call from this server.
			PLEIADES_MCP_USER: z.string().min(1).default("mcp"),
		},
		runtimeEnv: env,
		emptyStringAsUndefined: true,
	});
}
