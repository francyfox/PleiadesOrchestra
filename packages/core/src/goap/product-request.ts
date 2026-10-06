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

const NUMBER_WORDS: Record<string, number> = {
	a: 1,
	an: 1,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
	dozen: 12,
	couple: 2,
	fifteen: 15,
	twenty: 20,
};

/** What the shopper asks for before the product: verbs, politeness, determiners. */
const LEADING =
	/^(?:please\s+)?(?:(?:can|could)\s+you\s+)?(?:(?:i\s*)?(?:want|need|would\s+like|'d\s+like)(?:\s+to\s+(?:buy|order|get|have))?|(?:buy|add|order|put|get|find|search(?:\s+for)?|look(?:\s+for)?|show|give|take|bring|throw|purchase|toss|drop)(?:\s+(?:me|down|in|on|up|out))?|let'?s\s+(?:buy|get))\b/i;
/** Where it goes, and the courtesies after it. */
const TRAILING =
	/\s*(?:\b(?:to|in|into|from|on)\s+(?:the|my|your)?\s*(?:cart|basket|bag|list|order)\b|\bplease\b|\bfor\s+me\b|\bthanks?\b)\s*$/i;
const DETERMINERS = /^(?:the|a|an|some|any|my|more|another|few|several)\s+/i;
const CONTAINERS =
	/^(?:bottles?|loaves|loaf|packs?|packages?|pieces?|cans?|cartons?|boxes|box|bags?|jars?|kg|kilos?|kilograms?|pounds?|lbs?|liters?|litres?|bunch(?:es)?|dozen)\s+of\s+/i;

/**
 * Reads what to buy and how many out of the shopper's message **translated to
 * English** — no model. The verbs and politeness of a shop request are a small
 * closed set, so peeling them off leaves the product: «buy two bottles of
 * milk» → 2 × «milk». It replaces the text-model call
 * (`parseProductRequest`, ~400 ms) whenever a translation exists; without
 * one (no translator) that call is still used. Weak spots are the
 * translator's own: a product it renders wrongly stays wrong.
 */
export function extractProductRequest(
	english: string,
	userMessage: string,
): ProductRequest {
	let text = english
		.trim()
		.toLowerCase()
		.replace(/[.!?…]+$/g, "")
		.replace(/\s+/g, " ");

	text = text.replace(LEADING, "").trim();
	for (let i = 0; i < 2; i++) text = text.replace(TRAILING, "").trim();

	// A count: digits, or a number word at the front ("three bananas", "a dozen eggs").
	let quantity: number | undefined;
	const digits = text.match(/^(\d+)\s+/);
	if (digits) {
		quantity = clampQuantity(Number(digits[1]));
		text = text.slice(digits[0].length);
	} else {
		// "a dozen eggs", "two dozen eggs": a number word, then maybe "dozen".
		const dozens = text.match(/^(?:([a-z]+)\s+)?dozen\s+(?:of\s+)?/);
		const word = text.match(/^([a-z]+)\s+/);
		if (dozens) {
			const times = dozens[1] ? NUMBER_WORDS[dozens[1]] : 1;
			quantity = clampQuantity((times ?? 1) * 12);
			text = text.slice(dozens[0].length);
		} else {
			const value = word ? NUMBER_WORDS[word[1] as string] : undefined;
			if (word && value !== undefined) {
				quantity = clampQuantity(value);
				text = text.slice(word[0].length);
			}
		}
	}
	text = text.replace(DETERMINERS, "").replace(CONTAINERS, "").trim();

	const query = text.split(" ").slice(0, 4).join(" ").trim();
	return query
		? { query, quantity: quantity ?? 1 }
		: { query: userMessage.trim(), quantity: quantity ?? 1 };
}

const RU_NUMBERS: Record<string, number> = {
	один: 1,
	одна: 1,
	одну: 1,
	одно: 1,
	два: 2,
	две: 2,
	три: 3,
	четыре: 4,
	пять: 5,
	шесть: 6,
	семь: 7,
	восемь: 8,
	девять: 9,
	десять: 10,
	дюжина: 12,
	дюжину: 12,
};
const RU_LEADING =
	/^(?:пожалуйста,?\s+)?(?:(?:мне|нам)\s+)?(?:нуж\p{L}*|надо|хочу(?:\s+купить)?|хотел(?:а)?\s+бы(?:\s+купить)?|купи(?:ть|те)?|куплю|закажи(?:те)?|заказать|добавь(?:те)?|положи(?:те)?|закинь|бери(?:те)?|найди(?:те)?|найти|поищи(?:те)?|ищи|покажи(?:те)?)(?:\s+мне)?(?![\p{L}])/iu;
const RU_WHERE = /(?:^|\s)в\s+(?:мою\s+)?(?:корзину|корзинку)(?=\s|,|$)/giu;
// (JS `\b` is ASCII-only, so Cyrillic word edges are spelled out.)
const RU_POLITE = /[\s,]*(?<![\p{L}])(?:пожалуйста|спасибо)(?![\p{L}])\s*$/iu;
const RU_CONTAINERS =
	/^(?:пачк\p{L}*|пакет\p{L}*|бутылк\p{L}*|упаковк\p{L}*|банк\p{L}*|коробк\p{L}*|булк\p{L}*|кусо\p{L}*|штук\p{L}*|кг|килограмм\p{L}*|литр\p{L}*|грамм\p{L}*)\s+(?:из\s+)?/iu;

/**
 * Same job as {@link extractProductRequest}, for a shop whose catalog is in
 * Russian: its search needs the Russian word, so the shopper's own message is
 * used, never the English translation. Verbs, «в корзину», politeness, a count
 * («три», «2»), a container («пакета», «бутылки») are peeled off; the product
 * keeps the form the shopper typed («банана» stays «банана» — the shop's search
 * is expected to stem). A number that is part of a model name (iPhone 15)
 * stays, because only a leading number is a count.
 */
export function extractProductRequestRu(message: string): ProductRequest {
	let text = message.trim().replace(/[.!?…]+$/g, "");
	text = text.replace(RU_LEADING, "").replace(RU_WHERE, " ").trim();
	text = text
		.replace(RU_POLITE, "")
		.replace(/^[\s,]+/, "")
		.trim();

	let quantity: number | undefined;
	const digits = text.match(/^(\d+)\s+(?=\p{L})/u);
	if (digits) {
		quantity = clampQuantity(Number(digits[1]));
		text = text.slice(digits[0].length);
	} else {
		const word = text.match(/^(\p{L}+)\s+/u);
		const value = word
			? RU_NUMBERS[(word[1] as string).toLowerCase()]
			: undefined;
		if (word && value !== undefined) {
			quantity = clampQuantity(value);
			text = text.slice(word[0].length);
		}
	}
	text = text.replace(RU_CONTAINERS, "").trim();

	const query = text.split(/\s+/).slice(0, 4).join(" ").trim();
	return query
		? { query, quantity: quantity ?? 1 }
		: { query: message.trim(), quantity: quantity ?? 1 };
}

/** Longer than this, the English text is condensed by the text model before the tools see it. */
const LONG_REQUEST_CHARS = 300;
/** Clause words: the product is not simply what follows the verb («if you can't find X, find Y»). */
const CLAUSE_WORDS =
	/\b(?:if|but|because|since|so|then|instead|otherwise|can't|cannot|couldn't|won't|didn't|don't|not)\b/i;

/**
 * Whether the rules can be trusted with this English text: a short command
 * («buy two cheeses», «find me a phone») or a bare product. Anything with
 * clauses or a lead-in («well, if you can't find X, find Y») is left to the
 * function-call model, which reads the whole sentence — the rules would take
 * its first words as the product.
 */
export function isSimpleRequest(english: string): boolean {
	const text = english.trim().replace(/[.!?…]+$/g, "");
	if (CLAUSE_WORDS.test(text)) return false;
	const words = text.split(/\s+/).length;
	return words <= 3 || (LEADING.test(text.toLowerCase()) && words <= 12);
}

/**
 * Words that carry no product: the purchase verb, politeness, «now/then» and
 * a bare pronoun. A message made only of them («now buy them», «купи», «а
 * теперь купи 3») leaves the product to the conversation, not the message.
 * Deliberately a short closed list — it is only used to decide that NOTHING is
 * named; a message that names any other word is searched for as before.
 */
const FILLER_EN = new Set(
	"now then and so ok okay well also just please thanks thank you can could would will want need like to buy get add order take purchase them it this that those these one ones some more me the a an".split(
		" ",
	),
);
const FILLER_RU = new Set(
	"а и ну так теперь тогда давай ладно хорошо также ещё еще пожалуйста спасибо мне нам хочу хотим нужно надо можешь можете купи купить купите куплю возьми взять закажи заказать добавь добавить положи их его её ее это эти этот те тот то же".split(
		" ",
	),
);

/** Whether the message names no product at all (only verbs, politeness, a count, a pronoun). */
export function namesNoProduct(state: {
	userMessage?: unknown;
	userMessageEn?: unknown;
	catalogLang?: unknown;
}): boolean {
	const english =
		typeof state.userMessageEn === "string" ? state.userMessageEn : "";
	const catalogLang = String(state.catalogLang ?? "en").split("-")[0];
	const useEnglish = english !== "" && catalogLang !== "ru";
	const text = useEnglish ? english : String(state.userMessage ?? "");
	const words = text
		.toLowerCase()
		.replace(/\d+/g, " ")
		.split(/[^\p{L}']+/u)
		.filter(Boolean);
	if (words.length === 0) return false;
	return words.every((word) => FILLER_EN.has(word) || FILLER_RU.has(word));
}

/**
 * «Buy them» after a search: the message names no product, so the product the
 * last search found (`lastProduct`, a session fact) is the one to buy and the
 * search is not repeated (`catalogSearched`). Absent when the message names
 * a product itself, or nothing was found before (`lastProduct` is empty after
 * a failed search).
 */
export function reuseLastProduct(state: {
	lastProduct?: unknown;
	userMessage?: unknown;
	userMessageEn?: unknown;
	catalogLang?: unknown;
}): Partial<WorldState> | undefined {
	const product = state.lastProduct;
	if (typeof product !== "string" || !product) return undefined;
	if (!namesNoProduct(state)) return undefined;
	const text = String(state.userMessageEn ?? state.userMessage ?? "");
	return {
		product,
		query: product,
		quantity: clampQuantity(firstNumber(text)),
		requestParsed: true,
		catalogSearched: true,
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
			// The search goes to the site's tool, so the query is in the language of
			// the site's catalog (`catalogLang`, default English), not the shopper's.
			const catalogLang = String(state.catalogLang ?? "en").split("-")[0];
			if (catalogLang === "ru") {
				return { requestParsed: true, ...extractProductRequestRu(message) };
			}
			if (catalogLang !== "en") {
				// No rules for this language: its own words are the best query there is.
				return { requestParsed: true, ...parseProductRequest("", message) };
			}
			// A translation exists: the verbs and politeness are peeled off the
			// English text, no model call (~0 ms instead of ~400 ms).
			const english =
				typeof state.userMessageEn === "string" ? state.userMessageEn : "";
			if (english && english.length <= LONG_REQUEST_CHARS) {
				if (!isSimpleRequest(english)) {
					// No `query` fact: facts beat the model's own arguments, and a
					// guess from the first words would beat the model's reading.
					return { requestParsed: true, quantity: 1 };
				}
				const { query, quantity } = extractProductRequest(english, message);
				return { requestParsed: true, query, quantity };
			}
			let reply = "";
			for await (const event of config.agent.handleMessageStream({
				threadId: String(state.threadId ?? ""),
				userId: String(state.userId ?? ""),
				planRunId:
					typeof state.planRunId === "string" ? state.planRunId : undefined,
				actionName: "parseProductRequest",
				chunks: [english || message],
			})) {
				if (event.type === "delta") reply += event.text;
			}
			const { query, quantity } = parseProductRequest(
				reply,
				english || message,
			);
			return {
				requestParsed: true,
				query,
				quantity,
			} satisfies Partial<WorldState>;
		},
	};
}
