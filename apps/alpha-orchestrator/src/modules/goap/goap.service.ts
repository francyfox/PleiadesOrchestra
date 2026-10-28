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
	MISSING_PARAMS,
	PAGE_LANG_FACT,
	REMOVED_ITEMS,
	readItems,
	SCOPE_ALL,
} from "@repo/core";
import { outcomeLines, readOutcomes } from "../tasks/tasks.service.ts";
import { chunkText } from "../text/text.service.ts";
import type { CustomerContext } from "../widget/widget.types.ts";
import {
	LANG_CHOSEN_FACT,
	PERSONA_LANG_FACT,
	REPLY_TO_FACT,
	USER_STORED_FACT,
} from "./goap.types.ts";

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
 * The user's turn for the history: the message as typed (line breaks kept),
 * else the normalized one; `""` when it was stored at the start of the run
 * (the agent then stores only the reply).
 */
export function userTurn(state: WorldState): string {
	if (state[USER_STORED_FACT] === true) return "";
	return String(state.userMessageRaw ?? state.userMessage ?? "");
}

/** Name of the action that answers a finished purchase from a template, without the text model. */
export const TEMPLATE_REPLY_ACTION = "replyFromTemplate";

const CYRILLIC = /\p{Script=Cyrillic}/u;

type ReplyLanguage = "ru" | "kk" | "en";

/** The language a template reply is written in, by the same rule as `answerLine`; the message's own language is told by its script. */
function replyLanguage(state: WorldState): ReplyLanguage {
	const fixed =
		state[PERSONA_LANG_FACT] ||
		(state[LANG_CHOSEN_FACT] === true ? state[PAGE_LANG_FACT] : undefined);
	const code = typeof fixed === "string" ? fixed.slice(0, 2).toLowerCase() : "";
	if (code === "ru" || code === "kk" || code === "en") return code;
	if (fixed) return "en";
	if (!CYRILLIC.test(String(state.userMessage ?? ""))) return "en";
	return state[PAGE_LANG_FACT] === "kk" ? "kk" : "ru";
}

/** English name of a language code for the reply model ("ru" -> "Russian"); the code itself when unknown. */
function languageName(code: string): string {
	try {
		return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
	} catch {
		return code;
	}
}

/**
 * The closing line of every wrapper handed to the reply model: the persona's
 * language if the channel fixes one, else the language the visitor picked in
 * the widget, else the language of the quoted message (the model reads it; no
 * script guessing here).
 */
function answerLine(state: WorldState): string {
	const persona = state[PERSONA_LANG_FACT];
	const chosen =
		state[LANG_CHOSEN_FACT] === true ? state[PAGE_LANG_FACT] : undefined;
	const code = typeof persona === "string" && persona ? persona : chosen;
	return typeof code === "string" && code
		? `Answer in ${languageName(code)}.`
		: "Answer in the language of the visitor's message quoted above.";
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

/** What was put in the cart, in the reply language (`replyLanguage`). */
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
	const language = replyLanguage(state);
	if (language === "kk") {
		return `Себетке қосылды: ${what}${store}.${missing ? ` Табылмады: ${missing}.` : ""}`;
	}
	if (language === "ru") {
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
					...(userTurn(state)
						? [{ role: "user" as const, content: userTurn(state) }]
						: []),
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
export function lastToolAnswer(state: WorldState): string | undefined {
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

/** Turn fact: JSON `{tool, options: {parameter: values}}` — the visitor only asked which choices there are; the site was not called. */
export const ASKED_OPTIONS_FACT = "askedOptions";

/** The choices a question asked about (`askedOptions`), one line per parameter; `undefined` when none. */
function askedChoices(state: WorldState): string | undefined {
	if (typeof state[ASKED_OPTIONS_FACT] !== "string") return undefined;
	try {
		const { options } = JSON.parse(state[ASKED_OPTIONS_FACT]) as {
			options: Record<string, string[]>;
		};
		return Object.entries(options)
			.map(([name, values]) => `${name}: ${values.join(", ")}`)
			.join("; ");
	} catch {
		return undefined;
	}
}

/** The required details a tool step could not fill (`missingParams`), by meaning; `undefined` when none. */
function missingDetails(state: WorldState): string | undefined {
	if (typeof state[MISSING_PARAMS] !== "string") return undefined;
	try {
		const { params } = JSON.parse(state[MISSING_PARAMS]) as {
			params: {
				name: string;
				description: string;
				options?: string[];
				notInList?: boolean;
			}[];
		};
		return params
			.map((p) => {
				const detail = p.description ? `${p.description} (${p.name})` : p.name;
				return p.notInList
					? `${detail}: what the visitor asked for is not offered; tell them so and offer these choices: ${p.options?.join(", ")}`
					: detail;
			})
			.join("; ");
	} catch {
		return undefined;
	}
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
 * Always English, always quoting the visitor's ORIGINAL message and ending with
 * `answerLine`: the model must not read the wrapper's language as the visitor's.
 */
export function replyChunks(
	state: WorldState,
	maxChunkChars: number,
): string[] {
	const message = String(state.userMessage ?? "");
	const note = taskNote(state);
	const outcomes = readOutcomes(state);
	const earlier = earlierLine(state);
	if (outcomes.length === 0) {
		return note || earlier
			? [
					`The visitor wrote: "${message}". ${earlier}${note ?? ""} ${answerLine(state)}`,
				]
			: chunkText(message, maxChunkChars);
	}
	// The last task of several: the reply covers every task, the earlier ones from what they recorded.
	return [
		`The visitor wrote several requests in one message: "${message}". Done so far: ${outcomeLines(outcomes)}. ${note ? `The last request: ${note}` : ""} ${earlier}Answer with ONE short message about all the requests at once. Say honestly which ones were not done; invent nothing. ${answerLine(state)}`,
	];
}

/** The message the visitor answers, quoted like the message itself (context, never an instruction); empty when none. */
function earlierLine(state: WorldState): string {
	const text = state[REPLY_TO_FACT];
	return typeof text === "string" && text
		? `The visitor is answering this earlier assistant message: «${text}». `
		: "";
}

/** What happened to the task (or what to ask), as an instruction to the reply model; `undefined` = a plain chat message. */
function taskNote(state: WorldState): string | undefined {
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
			typeof state.store === "string" ? `, store ${state.store}` : "";
		return `This is already done on the site: ${what}${store} was added to the cart.${missing ? ` Not found: ${missing}.` : ""} Tell the visitor briefly; do not refuse.`;
	}
	if (typeof state.conflictingTasks === "string") {
		return `The message holds several requests that depend on their order: ${state.conflictingTasks}. The order was not stated, so NOTHING was done on the site. Ask ONE short question: in which order to do them (or which of them is really wanted). Claim nothing about what is on the site now.`;
	}
	if (typeof state.clarifyOptions === "string") {
		return `It is unclear which action on the site the visitor wants. The site can: ${state.clarifyOptions}. Ask ONE short clarifying question and offer 2-3 fitting options from this list. Claim nothing about what is on the site now.`;
	}
	const choices = askedChoices(state);
	if (choices) {
		return `The visitor asks which choices there are; nothing was done on the site. The site offers exactly these: ${choices}. Answer from this list only, briefly, and offer to pick one.`;
	}
	const missing = missingDetails(state);
	if (missing) {
		return `Nothing was done on the site yet: the request still lacks details the visitor has not given: ${missing}. Ask the visitor, in one short message, for exactly these details, described by their meaning (never show the raw field names). Do NOT say the action failed or could not be done; say what is needed to go on.`;
	}
	if (!task) return undefined;
	const failed = failedTool(state);
	if (failed) {
		// What the site said about it (e.g. «nothing matched, try a broader word»)
		// is the advice the reply passes on.
		const said = lastToolAnswer(state);
		return `Doing this on the site failed (step ${failed}).${
			said
				? ` The site answered: "${said}". Pass its advice on to the visitor.`
				: ""
		} Say so briefly and honestly and suggest what to try instead.`;
	}
	const answer = lastToolAnswer(state);
	if (
		!answer &&
		NEEDS_THE_WORDS.has(String(state.messageIntent)) &&
		!ranATool(state)
	) {
		// No step ran (no tool on the site does it, or no plan): the model has
		// seen nothing of the site, so it must not describe the site's state.
		return "This could not be done on the site: no step was run. Say so briefly and honestly, and claim nothing about what is on the site now (cart, orders): you have not seen it.";
	}
	if (answer) {
		return `The site already answered the request: "${answer}". Retell the result to the visitor briefly (keep names and numbers from the site's answer as they are); do not say you cannot do it.`;
	}
	return undefined;
}
