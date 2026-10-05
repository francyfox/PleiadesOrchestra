import type {
	ActionContext,
	Agent,
	GoapAction,
	HistoryStore,
	StreamingContext,
	WorldState,
} from "@repo/core";
import { createTextAction, PAGE_LANG_FACT } from "@repo/core";
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

/** The user's turn for the history: the message as typed (line breaks kept), else the normalized one. */
export function userTurn(state: WorldState): string {
	return String(state.userMessageRaw ?? state.userMessage ?? "");
}

/** Name of the action that answers a finished purchase from a template, without the text model. */
export const TEMPLATE_REPLY_ACTION = "replyFromTemplate";

const CYRILLIC = /\p{Script=Cyrillic}/u;

/** What was put in the cart, in the language the shopper writes in (the page's, else the message's script). */
function cartReplyText(state: WorldState): string {
	const quantity = typeof state.quantity === "number" ? state.quantity : 1;
	const product = String(state.product ?? "");
	const store = typeof state.store === "string" ? ` (${state.store})` : "";
	const lang = state[PAGE_LANG_FACT];
	const message = String(state.userMessage ?? "");
	if (lang === "kk")
		return `Себетке қосылды: ${quantity} × ${product}${store}.`;
	if (lang === "ru" || (lang === undefined && CYRILLIC.test(message))) {
		return `Добавил в корзину: ${quantity} × ${product}${store}.`;
	}
	return `Added to your cart: ${quantity} × ${product}${store}.`;
}

/**
 * The reply to a purchase that already happened — «Добавил в корзину: 1 ×
 * Honeycrisp Apples (Penny Pantry).» — with no model call (the 1B reply model
 * took ~2 s to say the same, and sometimes refused to). It costs less than
 * `generateReply` and needs `inCart`, so the planner picks it exactly when the
 * message was classified as a purchase and the goal includes a cart addition;
 * any other message still goes to the model.
 * Streamed as one `delta`, and the exchange is stored like a model's reply.
 */
export function createTemplateReplyAction(
	history: HistoryStore | undefined,
): GoapAction {
	return {
		name: TEMPLATE_REPLY_ACTION,
		cost: 1,
		// `messageIntent` is a fact no action produces, so the template is only
		// ever planned for a message classified as a purchase — never for a chat
		// that a cheap-enough chain of tools could otherwise reach.
		preconditions: { inCart: true, messageIntent: "addToCart" },
		effects: { replied: true },
		async execute(ctx: ActionContext) {
			const { state } = ctx;
			const text = cartReplyText(state);
			(ctx as ActionContext & StreamingContext).onDelta?.(text);
			await history?.append(
				{
					threadId: String(state.threadId ?? ""),
					userId: String(state.userId ?? ""),
					planRunId:
						typeof state.planRunId === "string" ? state.planRunId : undefined,
					actionName: TEMPLATE_REPLY_ACTION,
				},
				[
					{ role: "user", content: userTurn(state) },
					{ role: "assistant", content: text },
				],
			);
			return { replied: true, replyText: text, elapsedMs: 0 };
		},
	};
}

/**
 * The static GOAP catalog: the `generateReply` action that wraps the text
 * `Agent`, and the templated reply for a finished purchase. Built once per app
 * instance — nothing in it depends on a request. Per-thread actions (WebMCP
 * tools) are added on top at request time.
 */
export function buildActions(
	agent: Agent,
	maxChunkChars: number,
	history?: HistoryStore,
): GoapAction[] {
	return [
		createTemplateReplyAction(history),
		createTextAction({
			name: REPLY_ACTION,
			// The only action for now, so its cost doesn't compete with anything yet.
			cost: 5,
			preconditions: {},
			effects: { replied: true },
			agent,
			toChunks: (state) => replyChunks(state, maxChunkChars),
			// The model gets a normalized (and, after a task, rewritten) prompt; the
			// history keeps what the user typed, so a reload shows it as it was.
			toHistoryText: userTurn,
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

/** Longest tool answer handed to the reply model: a 1B model drowns in a whole catalog page. */
const REPLY_TOOL_TEXT_CHARS = 800;

/** The newest answer a site tool gave (`webmcp:<tool>:text`), if any — facts keep the order they were written in. */
function lastToolAnswer(state: WorldState): string | undefined {
	const keys = Object.keys(state).filter(
		(key) => key.startsWith("webmcp:") && key.endsWith(":text"),
	);
	const value = keys.length > 0 ? state[keys[keys.length - 1] as string] : "";
	return typeof value === "string" && value.trim() !== ""
		? value.trim().slice(0, REPLY_TOOL_TEXT_CHARS)
		: undefined;
}

/** A tool step that ended in failure (`toolResult:<tool> = false`). */
function failedTool(state: WorldState): string | undefined {
	return Object.keys(state)
		.find((key) => key.startsWith("toolResult:") && state[key] === false)
		?.slice("toolResult:".length);
}

/**
 * What the reply model is given. Normally the user's message. After a task it
 * is what happened, so the reply tells the user the outcome instead of
 * answering the request as if nothing had been done: an item put in a cart,
 * what a search found, or that a step failed. (The message alone made the
 * model say it "can't find apples" right after the site had listed them.)
 */
export function replyChunks(
	state: WorldState,
	maxChunkChars: number,
): string[] {
	const message = String(state.userMessage ?? "");
	const task =
		typeof state.messageIntent === "string" && state.messageIntent !== "chat";
	if (state.inCart === true && typeof state.product === "string") {
		const quantity = typeof state.quantity === "number" ? state.quantity : 1;
		const store =
			typeof state.store === "string" ? `, магазин ${state.store}` : "";
		return [
			`Пользователь написал: «${message}». Это уже сделано на сайте: в корзину добавлено ${quantity} × ${state.product}${store}. Коротко сообщи ему об этом, не отказывайся.`,
		];
	}
	if (task) {
		const failed = failedTool(state);
		if (failed) {
			// What the site said about it (e.g. «nothing matched, try a broader word»)
			// is the advice the reply passes on — in the user's language, in persona.
			const said = lastToolAnswer(state);
			return [
				`Пользователь написал: «${message}». Выполнить это на сайте не удалось (шаг ${failed}).${
					said
						? ` Сайт ответил: «${said}». Передай его совет пользователю.`
						: ""
				} Коротко и честно скажи об этом на языке сообщения пользователя и предложи, что можно попробовать вместо этого.`,
			];
		}
		const answer = lastToolAnswer(state);
		if (answer) {
			return [
				`Пользователь написал: «${message}». Сайт уже ответил на запрос: «${answer}». Коротко перескажи пользователю результат на языке его сообщения (названия товаров оставь как есть), не говори, что не можешь этого сделать.`,
			];
		}
	}
	return chunkText(message, maxChunkChars);
}
