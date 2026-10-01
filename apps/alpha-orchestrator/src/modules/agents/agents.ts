import { Elysia } from "elysia";
import {
	type AgentSpec,
	type FetchLike,
	probeAgents,
} from "./agents.service.ts";

export interface AgentsDeps {
	/** Agents listed (and health-probed) by `GET /v1/admin/agents`, with the fetch used to probe them (tests inject one). */
	agents?: { specs: AgentSpec[]; fetch?: FetchLike };
	now: () => number;
}

/** Admin route: the configured LLM and decision agents with a live health check. */
export function agentsRoutes({ agents, now }: AgentsDeps) {
	return new Elysia({ prefix: "/v1/admin/agents" }).get("/", async () => ({
		items: await probeAgents(agents?.specs ?? [], {
			fetch: agents?.fetch,
			now,
		}),
	}));
}
