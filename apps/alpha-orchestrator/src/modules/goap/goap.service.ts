import type {
	ActionContext,
	Agent,
	GoapAction,
	HistoryStore,
	StreamingContext,
	WorldState,
} from "@repo/core";
import {
	createTextAction,
	FOUND_ITEMS,
	itemsText,
	LIST_EMPTY,
	LIST_READ,
	MISSING_ITEMS,
	PAGE_LANG_FACT,
	REMOVED_ITEMS,
	readItems,
	SCOPE_ALL,
} from "@repo/core";
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

type ReplyLanguage = "ru" | "kk" | "en";

/** The language to answer in: the page's, else the message's script. */
function replyLanguage(state: WorldState): ReplyLanguage {
	const lang = state[PAGE_LANG_FACT];
	if (lang === "kk") return "kk";
	const message = String(state.userMessage ?? "");
	return lang === "ru" || (lang === undefined && CYRILLIC.test(message))
		? "ru"
		: "en";
}

/** What was taken out of the cart (or that it was empty already), from the facts the removing steps wrote. */
function removalReplyText(state: WorldState): string {
	const language = replyLanguage(state);
	if (state[LIST_EMPTY] === true) {
		return {
			ru: "В корзине уже пусто.",
			kk: "Себет бос.",
			en: "Your cart is already empty.",
		}[language];
	}
	const what = itemsText(readItems(state, REMOVED_ITEMS));
	const store = typeof state.store === "string" ? ` (${state.store})` : "";
	return {
		ru: `Убрал из корзины: ${what}${store}.`,
		kk: `Себеттен алынды: ${what}${store}.`,
		en: `Removed from your cart: ${what}${store}.`,
	}[language];
}

/** What was put in the cart, in the language the shopper writes in (the page's, else the message's script). */
function cartReplyText(state: WorldState): string {
	const quantity = typeof state.quantity === "number" ? state.quantity : 1;
	const found = readItems(state, FOUND_ITEMS);
	// Several things: all of them; one: as always.
	const what =
		found.length > 1
			? itemsText(found)
			: `${quantity} × ${String(state.product ?? "")}`;
	const missing = readItems(state, MISSING_ITEMS)
		.map((item) => item.name)
		.join(", ");
	const store = typeof state.store === "string" ? ` (${state.store})` : "";
	const lang = state[PAGE_LANG_FACT];
	const message = String(state.userMessage ?? "");
	if (lang === "kk") {
		return `Себетке қосылды: ${what}${store}.${missing ? ` Табылмады: ${missing}.` : ""}`;
	}
	if (lang === "ru" || (lang === undefined && CYRILLIC.test(message))) {
		return `Добавил в корзину: ${what}${store}.${missing ? ` Не нашёл: ${missing}.` : ""}`;
	}
	return `Added to your cart: ${what}${store}.${missing ? ` Not found: ${missing}.` : ""}`;
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
	return templateReply(
		TEMPLATE_REPLY_ACTION,
		// `messageIntent` is a fact no action produces, so the template is only
		// ever planned for a message classified as a purchase — never for a chat
		// that a cheap-enough chain of tools could otherwise reach.
		{ inCart: true, messageIntent: "addToCart" },
		cartReplyText,
		history,
	);
}

/** Name of the action that answers a removal of every item from a template. */
export const REMOVAL_REPLY_ACTION = "replyFromTemplate:removal";

/**
 * The reply to «remove everything» once the list was read and each item taken
 * out — or the list was empty: what the site's own answer showed, with no model
 * (which, asked about a cart it never saw, said "the cart is empty" at random).
 * `scopeAll` and `listRead` keep it from a one-product removal or a site that
 * clears with one call (those are answered by the model from the tool's answer).
 */
export function createRemovalReplyAction(
	history: HistoryStore | undefined,
): GoapAction {
	return templateReply(
		REMOVAL_REPLY_ACTION,
		{
			inCart: false,
			messageIntent: "removeFromCart",
			[SCOPE_ALL]: true,
			[LIST_READ]: true,
		},
		removalReplyText,
		history,
	);
}

function templateReply(
	name: string,
	preconditions: Partial<WorldState>,
	textOf: (state: WorldState) => string,
	history: HistoryStore | undefined,
): GoapAction {
	return {
		name,
		cost: 1,
		preconditions,
		effects: { replied: true },
		async execute(ctx: ActionContext) {
			const { state } = ctx;
			const text = textOf(state);
			(ctx as ActionContext & StreamingContext).onDelta?.(text);
			await history?.append(
				{
					threadId: String(state.threadId ?? ""),
					userId: String(state.userId ?? ""),
					planRunId:
						typeof state.planRunId === "string" ? state.planRunId : undefined,
					actionName: name,
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
	/** The channel's reply system prompt (its persona); `undefined` = the agent's own default. */
	replyPrompt?: (channelId: string) => string | undefined,
): GoapAction[] {
	return [
		createTemplateReplyAction(history),
		createRemovalReplyAction(history),
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
			systemPrompt: (state) =>
				typeof state.channelId === "string"
					? replyPrompt?.(state.channelId)
					: undefined,
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

/** Intents with a side effect that is only ever taken from the shopper's own words (`message-intent.ts`). */
const NEEDS_THE_WORDS: ReadonlySet<string> = new Set([
	"checkout",
	"removeFromCart",
]);

/** Some tool step ended (well or not) in this run. */
function ranATool(state: WorldState): boolean {
	return Object.keys(state).some((key) => key.startsWith("toolResult:"));
}

/** A tool step that ended in failure (`toolResult:<tool> = false`). */
function failedTool(state: WorldState): string | undefined {
	return Object.keys(state)
		.find((key) => key.startsWith("toolResult:") && state[key] === false)
		?.slice("toolResult:".length);
}

/**
 * What the reply model is given. Normally the user's message. After a task it
 * is what happened, so the reply tells the visitor the outcome instead of
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
		const found = readItems(state, FOUND_ITEMS);
		const what =
			found.length > 1 ? itemsText(found) : `${quantity} × ${state.product}`;
		const missing = readItems(state, MISSING_ITEMS)
			.map((item) => item.name)
			.join(", ");
		const store =
			typeof state.store === "string" ? `, магазин ${state.store}` : "";
		return [
			`Пользователь написал: «${message}». Это уже сделано на сайте: в корзину добавлено ${what}${store}.${missing ? ` Не нашлось: ${missing}.` : ""} Коротко сообщи ему об этом, не отказывайся.`,
		];
	}
	if (typeof state.clarifyOptions === "string") {
		return [
			`Пользователь написал: «${message}». Непонятно, какое действие на сайте ему нужно. Сайт умеет: ${state.clarifyOptions}. Задай ОДИН короткий уточняющий вопрос на языке сообщения пользователя и предложи 2-3 подходящих варианта из этого списка. Ничего не утверждай о том, что сейчас на сайте.`,
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
		if (
			!answer &&
			NEEDS_THE_WORDS.has(String(state.messageIntent)) &&
			!ranATool(state)
		) {
			// No step ran (no tool on the site does it, or no plan): the model has
			// seen nothing of the site, so it must not describe the site's state.
			return [
				`Пользователь написал: «${message}». На сайте это сделать не удалось: ни один шаг не выполнялся. Коротко и честно скажи об этом на языке сообщения пользователя и не утверждай ничего о том, что сейчас на сайте (в корзине, в заказах), — ты этого не видел.`,
			];
		}
		if (answer) {
			return [
				`Пользователь написал: «${message}». Сайт уже ответил на запрос: «${answer}». Коротко перескажи пользователю результат на языке его сообщения (названия, имена и числа из ответа сайта оставь как есть), не говори, что не можешь этого сделать.`,
			];
		}
	}
	return chunkText(message, maxChunkChars);
}
