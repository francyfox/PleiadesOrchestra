import { type LanguageCues, words } from "./shop.cues.ts";

// Names of shops the fixtures and demos use. Not English words, so every language lists them.
export const STORE_NAMES = ["greenleaf", "harbor", "penny"];

const STORE_WORD = words("market", "store", ...STORE_NAMES);

export const en: LanguageCues = {
	language: "en",
	slots: {
		removeFromCart: [
			words(
				"remove",
				"delete",
				"(?:clear|empty)(?:\\s+out)?\\s+(?:my|the|this|your|all|everything)",
				"take\\s+out",
				"get\\s+rid\\s+of",
				"don'?t\\s+want",
				"do\\s+not\\s+want",
			),
		],
		checkout: [
			words(
				"check\\s*out",
				"pay(?:\\s+now|\\s+for)?",
				"place\\s+(?:my|the|an)?\\s*order",
				"complete\\s+(?:my|the)\\s+(?:purchase|order)",
				"finish\\s+(?:my|the)\\s+order",
			),
		],
		chooseStore: [
			`(?=.*(?:${STORE_WORD}))(?=.*(?:${words("go\\s+to", "switch", "change", "let'?s\\s+shop", "shop\\s+at")})).*`,
		],
		select: [
			words("tell\\s+me\\s+more", "open\\s+the\\s+(?:first|second|third)"),
			`(?=.*${words("tell\\s+me\\s+more", "details?")})(?=.*${words("first", "second", "third")}).*`,
		],
		navigate: [
			`(?=.*(?:${words("open", "show", "go\\s+to", "take\\s+me\\s+to", "where")}))(?=.*(?:${words("cart", "orders?", "recipes?")})).*`,
		],
		compare: [
			words(
				"compare",
				"versus",
				"vs",
				"difference",
				"which\\s+one\\s+is\\s+better",
			),
		],
		paginate: [
			words("next(?:\\s+page)?", "previous", "more\\s+results", "show\\s+more"),
		],
		search: [
			words(
				"find",
				"search",
				"look\\s+for",
				"do\\s+you\\s+have",
				"show\\s+me",
				"what\\s+(?:kinds?\\s+of\\s+\\w+\\s+)?do\\s+you\\s+(?:have|sell)",
			),
		],
		buy: [words("buy", "add", "order", "put", "get\\s+me", "give\\s+me")],
		filter: [
			words(
				"only",
				"cheaper",
				"under\\s+\\d+",
				"just\\s+the",
				"gluten[-\\s]?free",
				"vegan",
				"organic",
			),
		],
		wantToBuy: [
			words("i\\s+need"),
			`${words("i\\s+want", "i'?d\\s+like")}(?!\\s+to\\s+(?:see|know|find|check|compare|look))`,
		],
		chat: [
			`^\\s*(?:${words("hello", "hi", "hey", "thanks", "thank\\s+you", "good\\s+(?:morning|evening|afternoon)", "you'?re\\s+great", "what\\s+can\\s+you\\s+do", "who\\s+are\\s+you", "how\\s+are\\s+you")})`,
			words("weather"),
		],
	},
	allOfThem: [
		words(
			"all",
			"everything",
			"every",
			"each",
			"entire",
			"whole",
			"(?:clear|empty)(?:\\s+out)?\\s+(?:my|the|this|your)",
		),
	],
};
