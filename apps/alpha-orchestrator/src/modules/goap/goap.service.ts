import type { Agent, GoapAction, WorldState } from "@repo/core";
import { createTextAction } from "@repo/core";
import { chunkText } from "../text/text.service.ts";
import type { CustomerContext } from "../widget/widget.types.ts";

/**
 * Base goal of every reply — chat or task. A message classified as a task
 * extends it with the intent's usual effect (`goalForIntent`), so the planner
 * has to chain in whatever action produces that effect instead of settling for
 * a bare reply.
 */
export const REPLY_GOAL = { replied: true };

/**
 * The static GOAP catalog: one `generateReply` action that wraps the text
 * `Agent`. Built once per app instance — nothing in it depends on a request.
 * Per-thread actions (WebMCP tools) are added on top at request time.
 */
export function buildActions(
	agent: Agent,
	maxChunkChars: number,
): GoapAction[] {
	return [
		createTextAction({
			name: "generateReply",
			// The only action for now, so its cost doesn't compete with anything yet.
			cost: 5,
			preconditions: {},
			effects: { replied: true },
			agent,
			toChunks: (state) =>
				chunkText(String(state.userMessage ?? ""), maxChunkChars),
			threadId: (state) => String(state.threadId ?? ""),
			userId: (state) => String(state.userId ?? ""),
			toEffects: (replyText, meta) => ({
				replied: true,
				replyText,
				elapsedMs: meta.elapsedMs,
				inputTokens: meta.inputTokens,
				outputTokens: meta.outputTokens,
				totalInputTokens: meta.totalInputTokens,
				totalOutputTokens: meta.totalOutputTokens,
			}),
		}),
	];
}

/**
 * Data the integrating site already knows about its customer (e.g. a delivery
 * city from its own UI), as world-state facts namespaced `customer:` so they
 * can never collide with bookkeeping facts (`threadId`, `replied`, …). The
 * orchestrator never interprets them; site-specific actions read them.
 */
export function customerFacts(
	context: CustomerContext | undefined,
): WorldState {
	const facts: WorldState = {};
	for (const [key, value] of Object.entries(context ?? {})) {
		facts[`customer:${key}`] = value;
	}
	return facts;
}
