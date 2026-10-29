import { Elysia, t } from "elysia";
import type { AgentSettings } from "../agent-settings/agent-settings.service.ts";
import {
	AGENT_IDS,
	type AgentId,
	modelTypeOf,
} from "../agent-settings/agent-settings.types.ts";

export interface CompletionsDeps {
	/** Read per request: an admin's save applies at once. */
	settings: Pick<AgentSettings, "effective">;
	/** Whose model answers when the body's `model` names no language agent (the reply model, `beta-text`). */
	agent: AgentId;
	fetch?: typeof fetch;
}

/**
 * `POST /v1/chat/completions` — beta's model as a plain OpenAI-compatible
 * endpoint, no planner: what `apps/benchmark` (`bun efficiency`) compares the
 * orchestrator against with the very same text model. The caller's body goes
 * on as it is (tools, stream, …); the model, key, reasoning effort and extra
 * body are beta's, or another language agent's when `model` is its id
 * (`albedo send --agent`). Not recorded in the usage ledger.
 */
export function completionsRoutes({
	settings,
	agent,
	fetch: fetchFn = fetch,
}: CompletionsDeps) {
	return new Elysia({ tags: ["Transport"] }).post(
		"/v1/chat/completions",
		async ({ body, request }) => {
			const named = AGENT_IDS.find(
				(id) => id === body.model && modelTypeOf(id) === "language",
			);
			const s = settings.effective(named ?? agent);
			const upstream = await fetchFn(
				`${s.baseUrl.replace(/\/+$/, "")}/chat/completions`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						...(s.apiKey ? { authorization: `Bearer ${s.apiKey}` } : {}),
					},
					body: JSON.stringify({
						...s.extraBody,
						...(s.reasoningEffort
							? { reasoning_effort: s.reasoningEffort }
							: {}),
						...body,
						model: s.model,
					}),
					signal: request.signal,
				},
			);
			return new Response(upstream.body, {
				status: upstream.status,
				headers: {
					"content-type":
						upstream.headers.get("content-type") ?? "application/json",
				},
			});
		},
		{
			// A record, not an object: Elysia drops fields an object schema doesn't list.
			body: t.Record(t.String(), t.Unknown()),
			detail: {
				summary: "Chat completion on beta's model",
				description:
					"OpenAI-compatible pass-through to the reply model in effect (`beta-text` agent settings), or to another language agent's model when `model` is its id (`alpha-understand`, `delta-function-call`): the body is sent as given with `model` replaced; the upstream status and body (a stream included) come back unchanged.",
			},
		},
	);
}
