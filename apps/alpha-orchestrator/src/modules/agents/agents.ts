import { Elysia } from "elysia";
import { AgentList } from "./agents.schema.ts";
import {
	type AgentHealth,
	type AgentSpec,
	type FetchLike,
	probeAgents,
} from "./agents.service.ts";

export interface AgentsDeps {
	/** Agents listed (and health-probed) by `GET /v1/admin/agents`, with the fetch used to probe them (tests inject one). */
	agents?: { specs: AgentSpec[] | (() => AgentSpec[]); fetch?: FetchLike };
	now: () => number;
}

/**
 * Admin route: the configured LLM and decision agents with a health check.
 * A down agent takes seconds to time out, so the answer is the previous probe
 * of the same specs while the next one runs; the admin's live push polls this
 * route and brings the fresh result. Only new specs (first call, an edited
 * base URL) wait for their own probe.
 */
export function agentsRoutes({ agents, now }: AgentsDeps) {
	let last: { key: string; items: AgentHealth[] } | undefined;
	let running: { key: string; probe: Promise<AgentHealth[]> } | undefined;

	const probe = (specs: AgentSpec[], key: string) => {
		if (running?.key === key) return running.probe;
		const probe = probeAgents(specs, { fetch: agents?.fetch, now }).then(
			(items) => {
				if (running?.probe === probe) {
					last = { key, items };
					running = undefined;
				}
				return items;
			},
		);
		running = { key, probe };
		return probe;
	};

	return new Elysia({
		prefix: "/v1/admin/agents",
		tags: ["Admin: agents"],
	}).get(
		"/",
		async () => {
			const specs =
				typeof agents?.specs === "function"
					? agents.specs()
					: (agents?.specs ?? []);
			const key = JSON.stringify(specs);
			const fresh = probe(specs, key);
			return { items: last?.key === key ? last.items : await fresh };
		},
		{
			detail: {
				summary: "List agents with health",
				description:
					"The configured LLM and decision agents with a health probe. Answers with the previous probe of the same specs while the next one runs; only new specs (first call, an edited base URL) wait for their own probe. A down agent has status `down` and a null latency.",
			},
			response: { 200: AgentList },
		},
	);
}
