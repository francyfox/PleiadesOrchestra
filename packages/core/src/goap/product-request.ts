import type { Agent } from "../types";
import { fact, say } from "./step-text";
import type { ActionContext, GoapAction, WorldState } from "./types";

export interface ProductRequest {
	/** What to search the catalog for, in the catalog's own language. */
	query: string;
	quantity: number;
}

const MAX_QUANTITY = 99;

/** First whole number in the text (digits only), or `undefined`. */
function firstNumber(text: string): number | undefined {
	const match = text.match(/\d+/);
	return match ? Number(match[0]) : undefined;
}

function clampQuantity(value: unknown): number {
	const number = typeof value === "string" ? Number(value) : value;
	return typeof number === "number" && Number.isInteger(number) && number >= 1
		? Math.min(number, MAX_QUANTITY)
		: 1;
}

/**
 * Reads the model's reply to the extraction prompt: the first `{…}` object in
 * it, `query` a non-empty string, `quantity` a positive integer (default 1).
 * A small model may add chatter around the JSON or drop it altogether — then
 * the user's own words are used as the query and the first number in them as
 * the quantity, so a bad reply costs accuracy, not the whole request.
 */
export function parseProductRequest(
	reply: string,
	userMessage: string,
): ProductRequest {
	const start = reply.indexOf("{");
	const end = reply.lastIndexOf("}");
	if (start !== -1 && end > start) {
		try {
			const parsed = JSON.parse(reply.slice(start, end + 1)) as {
				query?: unknown;
				quantity?: unknown;
			};
			if (typeof parsed.query === "string" && parsed.query.trim()) {
				return {
					query: parsed.query.trim(),
					quantity: clampQuantity(parsed.quantity),
				};
			}
		} catch {
			// fall through to the fallback below
		}
	}
	return {
		query: userMessage.trim(),
		quantity: clampQuantity(firstNumber(userMessage)),
	};
}

export interface ProductRequestActionConfig {
	/**
	 * An `Agent` whose system prompt asks for `{"query": …, "quantity": …}` and
	 * nothing else (see `agents.instance.ts` in the orchestrator).
	 */
	agent: Agent;
	cost?: number;
}

/**
 * "What does the user want to buy?" as a GOAP step: one short call to the text
 * model that turns «купи 1 сыр» into `query` = "cheese", `quantity` = 1. Tool
 * actions read those two facts by name when they build their arguments. An
 * LLM step because the query may need translating into the catalog's language,
 * which Laya (typed answers only) cannot do. The reply is parsed, never
 * streamed to the user.
 */
export function createProductRequestAction(
	config: ProductRequestActionConfig,
): GoapAction {
	return {
		name: "parseProductRequest",
		cost: config.cost ?? 5,
		preconditions: {},
		effects: { requestParsed: true },
		describe(state, phase) {
			const quantity = fact(state, "quantity", "1");
			const query = fact(state, "query");
			if (phase === "running") {
				return say(state, {
					ru: "Разбираю запрос…",
					en: "Reading your request…",
				});
			}
			if (phase === "done") {
				return say(state, {
					ru: `Понял: ${quantity} × «${query}»`,
					en: `Understood: ${quantity} × “${query}”`,
				});
			}
			return say(state, {
				ru: "Не удалось разобрать запрос",
				en: "Couldn't read the request",
			});
		},
		async execute(ctx: ActionContext) {
			const { state } = ctx;
			const message = String(state.userMessage ?? "");
			let reply = "";
			for await (const event of config.agent.handleMessageStream({
				threadId: String(state.threadId ?? ""),
				userId: String(state.userId ?? ""),
				planRunId:
					typeof state.planRunId === "string" ? state.planRunId : undefined,
				actionName: "parseProductRequest",
				chunks: [message],
			})) {
				if (event.type === "delta") reply += event.text;
			}
			const { query, quantity } = parseProductRequest(reply, message);
			return {
				requestParsed: true,
				query,
				quantity,
			} satisfies Partial<WorldState>;
		},
	};
}
