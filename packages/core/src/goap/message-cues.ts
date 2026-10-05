import type { MessageIntent } from "./message-intent";

/**
 * Lexical evidence for what a shopper's message asks for, in Russian and
 * English. Laya (a small typed-decision model) understands English well
 * (~88% on `INTENT_CASES`) and Russian badly (~55%): the same «купи сыр» came
 * back as `removeFromCart`, «оформи заказ» as `compare`. Verbs and nouns of a
 * shop are a small, stable vocabulary, so they are matched here first and
 * Laya only sorts what no rule claims.
 *
 * First match wins, so the order is the specificity: consequential and
 * narrow intents before broad ones, `chat` last. A rule must be something a
 * person would also call evidence — never a phrase fitted to one test message.
 * Stems have no end boundary (Russian endings); Latin words are whole words.
 */

/** `(?<![\p{L}\p{N}])` — a word must start here (JS `\b` is ASCII-only). */
const START = String.raw`(?<![\p{L}\p{N}])`;
const END = String.raw`(?![\p{L}\p{N}])`;

/** Alternatives that must begin a word; the last one may continue (a Russian stem). */
const stems = (...alternatives: string[]) =>
	`${START}(?:${alternatives.join("|")})`;
/** Whole Latin words/phrases. */
const words = (...alternatives: string[]) =>
	`${START}(?:${alternatives.join("|")})${END}`;

// `ё` is folded to `е` in the message (people skip the dots), so in the patterns too.
const rule = (intent: MessageIntent, ...patterns: string[]) => ({
	intent,
	regex: new RegExp(patterns.join("|").replaceAll("ё", "е"), "iu"),
});

const STORE_WORD =
	stems("магазин", "маркет") +
	"|" +
	words("market", "store", "greenleaf", "harbor", "penny");

const RULES = [
	rule(
		"removeFromCart",
		stems(
			"удал",
			"убер",
			"убра",
			"выкин",
			"достан",
			"не\\s+надо",
			"не\\s+нужн",
			"не\\s+хочу",
		),
		stems("передума"),
		words(
			"remove",
			"delete",
			"take\\s+out",
			"get\\s+rid\\s+of",
			"don'?t\\s+want",
			"do\\s+not\\s+want",
		),
	),
	rule(
		"checkout",
		stems(
			"оформ",
			"оплат",
			"оплач",
			"к\\s+оплате",
			"рассчита",
			"заверш\\p{L}*\\s+(?:покупк|заказ)",
		),
		stems("(?:всё|все),?\\s+заказ"),
		words(
			"check\\s*out",
			"pay(?:\\s+now|\\s+for)?",
			"place\\s+(?:my|the|an)?\\s*order",
			"complete\\s+(?:my|the)\\s+(?:purchase|order)",
			"finish\\s+(?:my|the)\\s+order",
		),
	),
	rule(
		"chooseStore",
		`(?=.*(?:${STORE_WORD}))(?=.*(?:${stems("перейд", "переключ", "смени", "давай\\s+в", "покупа\\p{L}*\\s+в", "заказыва\\p{L}*\\s+буду\\s+в", "в\\s+другой")}|${words("go\\s+to", "switch", "change", "let'?s\\s+shop", "shop\\s+at")})).*`,
	),
	rule(
		"select",
		`(?=.*${stems("открой", "расскажи", "покажи")})(?=.*${stems("перв", "втор", "трет", "подробн")}).*`,
		words("tell\\s+me\\s+more", "open\\s+the\\s+(?:first|second|third)"),
		`(?=.*${words("tell\\s+me\\s+more", "details?")})(?=.*${words("first", "second", "third")}).*`,
	),
	rule(
		"navigate",
		`(?=.*(?:${stems("открой", "покажи", "перейд", "зайди", "где", "что\\s+(?:у\\s+меня\\s+)?в(?![\\p{L}\\p{N}])")}|${words("open", "show", "go\\s+to", "take\\s+me\\s+to", "where")}))(?=.*(?:${stems("корзин", "заказ", "рецепт")}|${words("cart", "orders?", "recipes?")})).*`,
	),
	rule(
		"compare",
		stems("сравн", "разниц", "что\\s+лучше", "как(?:ой|ая|ое)\\s+лучше"),
		words(
			"compare",
			"versus",
			"vs",
			"difference",
			"which\\s+one\\s+is\\s+better",
		),
	),
	rule(
		"paginate",
		stems(
			"следующ",
			"предыдущ",
			"дальше",
			"покажи\\s+(?:ещё|еще)",
			"ещё\\s+результат",
		),
		words("next(?:\\s+page)?", "previous", "more\\s+results", "show\\s+more"),
	),
	rule(
		"search",
		stems(
			"найд",
			"найти",
			"поищ",
			"ищи",
			"ищу",
			"есть\\s+ли",
			"есть\\s+что",
			"что\\s+(?:у\\s+вас\\s+)?есть",
			"как(?:ие|ой)\\s+у\\s+вас",
			"что\\s+вы\\s+прода",
		),
		words(
			"find",
			"search",
			"look\\s+for",
			"do\\s+you\\s+have",
			"show\\s+me",
			"what\\s+(?:kinds?\\s+of\\s+\\w+\\s+)?do\\s+you\\s+(?:have|sell)",
		),
	),
	// Explicit verbs of buying outrank the words of a filter in the same message
	// («добавь самый дешёвый ноутбук»); the weak ones («хочу», «надо») do not.
	rule(
		"addToCart",
		stems(
			"купи",
			"куплю",
			"купить",
			"покупа",
			"закаж",
			"добав",
			"полож",
			"закин",
			"бер(?:и|ём|ем)",
		),
		words("buy", "add", "order", "put", "get\\s+me", "give\\s+me"),
	),
	rule(
		"filter",
		stems(
			"только",
			"дешевле",
			"дешёв",
			"дешев",
			"дороже",
			"без\\s",
			"безглютен",
			"веган",
			"органич",
		),
		words(
			"only",
			"cheaper",
			"under\\s+\\d+",
			"just\\s+the",
			"gluten[-\\s]?free",
			"vegan",
			"organic",
		),
	),
	rule(
		"addToCart",
		stems("мне\\s+нуж", "хочу", "надо"),
		words("i\\s+need"),
		`${words("i\\s+want", "i'?d\\s+like")}(?!\\s+to\\s+(?:see|know|find|check|compare|look))`,
	),
	rule(
		"chat",
		`^\\s*(?:${stems("привет", "здравств", "добр(?:ый|ое|ого|ых)", "хай", "спасибо", "благодар", "пока(?![\\p{L}\\p{N}])", "кто\\s+ты", "как\\s+дела", "что\\s+ты\\s+умеешь", "расскажи\\s+о\\s+себе")}|${words("hello", "hi", "hey", "thanks", "thank\\s+you", "good\\s+(?:morning|evening|afternoon)", "you'?re\\s+great", "what\\s+can\\s+you\\s+do", "who\\s+are\\s+you", "how\\s+are\\s+you")})`,
		stems("погод"),
		words("weather"),
	),
];

/**
 * The intent the message's own words point to, or `undefined` when no rule
 * claims it (then Laya decides). Not a replacement for Laya: it only answers
 * when a clear cue is there.
 */
export function intentFromCues(message: string): MessageIntent | undefined {
	const text = message.toLowerCase().replaceAll("ё", "е");
	for (const { intent, regex } of RULES) {
		if (regex.test(text)) return intent;
	}
	return undefined;
}
