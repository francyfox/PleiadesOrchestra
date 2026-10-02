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

/** Name of the action that writes the reply to the user. */
export const REPLY_ACTION = "generateReply";

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
			name: REPLY_ACTION,
			// The only action for now, so its cost doesn't compete with anything yet.
			cost: 5,
			preconditions: {},
			effects: { replied: true },
			agent,
			toChunks: (state) => replyChunks(state, maxChunkChars),
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

/**
 * What the reply model is given. Normally the user's message; after a task
 * that really changed something (an item put in a cart) it is that outcome, so
 * the reply tells the user what happened instead of answering the request as
 * if nothing had been done.
 */
export function replyChunks(
	state: WorldState,
	maxChunkChars: number,
): string[] {
	const message = String(state.userMessage ?? "");
	if (state.inCart === true && typeof state.product === "string") {
		const quantity = typeof state.quantity === "number" ? state.quantity : 1;
		const store =
			typeof state.store === "string" ? `, магазин ${state.store}` : "";
		return [
			`Пользователь написал: «${message}». Ты уже добавил в корзину: ${quantity} × ${state.product}${store}. Коротко сообщи ему об этом.`,
		];
	}
	return chunkText(message, maxChunkChars);
}
