// A tool's failure reaches the visitor ONLY as one of these codes. The site's own error text is never shown
// or quoted (it can be another language, hold HTML or internals): each code has its own wording below.
// Produced by the site's tool layer (the WordPress plugin: `assets/js/tools-core.js`, which repeats this
// list), consumed by the step trace (`webmcp-steps.ts`) and the orchestrator's failure reply.

export const TOOL_ERROR_CODES = [
	"MISSING_ARGUMENT",
	"NOT_FOUND",
	"NOT_PURCHASABLE",
	"OUT_OF_STOCK",
	"VARIATION_REQUIRED",
	"INVALID_QUANTITY",
	"CART_ITEM_GONE",
	"NOT_ALLOWED",
	"NETWORK",
	"NONCE_EXPIRED",
	"LIMIT_EXCEEDED",
	"UNKNOWN",
] as const;

export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number];

export type ToolErrorLanguage = "en" | "ru" | "kk";

/** The code in a tool's error text (`{"error_code":"OUT_OF_STOCK",…}`); anything else, or a code outside the list, is `UNKNOWN`. */
export function parseToolErrorCode(text: string): ToolErrorCode {
	try {
		const code = (JSON.parse(text) as { error_code?: unknown } | null)
			?.error_code;
		return TOOL_ERROR_CODES.find((known) => known === code) ?? "UNKNOWN";
	} catch {
		return "UNKNOWN";
	}
}

// Shop-domain wording, kept generic. `{product}` is the visitor's own product (our state, never the error text):
// «Name» when known, else a plain word. Templates that use it start with it.
const SOMETHING: Record<ToolErrorLanguage, string> = {
	en: "The item",
	ru: "Товар",
	kk: "Тауар",
};

const TEMPLATES: Record<ToolErrorCode, Record<ToolErrorLanguage, string>> = {
	MISSING_ARGUMENT: {
		en: "I need one more detail to do that. Could you say exactly which one you mean?",
		ru: "Чтобы это сделать, мне нужна ещё одна деталь. Уточните, что именно вы имеете в виду?",
		kk: "Мұны орындау үшін тағы бір мәлімет керек. Нақты нені айтып тұрғаныңызды нақтылай аласыз ба?",
	},
	NOT_FOUND: {
		en: "{product} was not found on the site.",
		ru: "{product} не найден на сайте.",
		kk: "{product} сайттан табылмады.",
	},
	NOT_PURCHASABLE: {
		en: "{product} can't be bought this way.",
		ru: "{product} нельзя купить таким способом.",
		kk: "{product} осылай сатып алынбайды.",
	},
	OUT_OF_STOCK: {
		en: "{product} is out of stock.",
		ru: "{product} нет в наличии.",
		kk: "{product} қоймада жоқ.",
	},
	VARIATION_REQUIRED: {
		en: "{product} comes in several options. Tell me which option you want.",
		ru: "{product} бывает в нескольких вариантах. Скажите, какой вариант вам нужен.",
		kk: "{product} бірнеше нұсқада бар. Қай нұсқасы керек екенін айтыңыз.",
	},
	INVALID_QUANTITY: {
		en: "That quantity isn't possible. Please name another number.",
		ru: "Такое количество не подходит. Назовите, пожалуйста, другое число.",
		kk: "Мұндай мөлшер жарамайды. Басқа санды айтыңыз.",
	},
	CART_ITEM_GONE: {
		en: "That item is no longer in the cart.",
		ru: "Этой позиции уже нет в корзине.",
		kk: "Бұл тауар себетте енді жоқ.",
	},
	NOT_ALLOWED: {
		en: "I can't do that on this site.",
		ru: "Этого я не могу сделать на этом сайте.",
		kk: "Мұны бұл сайтта орындай алмаймын.",
	},
	NETWORK: {
		en: "The site did not answer. Please try again in a moment.",
		ru: "Сайт не ответил. Попробуйте ещё раз через минуту.",
		kk: "Сайт жауап бермеді. Біраздан соң қайталап көріңіз.",
	},
	NONCE_EXPIRED: {
		en: "The session on the site has expired. Please reload the page and try again.",
		ru: "Сессия на сайте истекла. Обновите страницу и попробуйте ещё раз.",
		kk: "Сайттағы сессия аяқталды. Бетті жаңартып, қайталап көріңіз.",
	},
	LIMIT_EXCEEDED: {
		en: "That is more than I can add at once. Please choose a smaller amount.",
		ru: "Это больше, чем я могу добавить за один раз. Выберите, пожалуйста, меньшее количество.",
		kk: "Бұл бір рет қоса алатыннан көп. Азырақ мөлшерді таңдаңыз.",
	},
	UNKNOWN: {
		en: "That didn't work on the site. Please try again or put it in other words.",
		ru: "На сайте это не получилось. Попробуйте ещё раз или переформулируйте.",
		kk: "Сайтта бұл болмады. Қайталап көріңіз немесе басқаша айтып көріңіз.",
	},
};

/** The visitor-facing sentence for `code`; `product` is the visitor's own wording of the item, if any. */
export function toolErrorText(
	code: ToolErrorCode,
	language: ToolErrorLanguage,
	product?: string,
): string {
	const name = product?.trim();
	return TEMPLATES[code][language].replace(
		"{product}",
		name ? `«${name}»` : SOMETHING[language],
	);
}

/** The code of the tool's answer, if that answer was an error (`webmcp:<tool>:result` is `error`). */
export function toolErrorCodeOf(
	state: Record<string, unknown>,
	tool: string,
): ToolErrorCode | undefined {
	return state[`webmcp:${tool}:result`] === "error"
		? parseToolErrorCode(String(state[`webmcp:${tool}:text`] ?? ""))
		: undefined;
}

/** The error of the NEWEST tool answer, if that answer was an error (facts keep the order they were written in). */
export function lastToolError(
	state: Record<string, unknown>,
): { tool: string; code: ToolErrorCode } | undefined {
	const key = Object.keys(state)
		.filter((k) => k.startsWith("webmcp:") && k.endsWith(":text"))
		.at(-1);
	if (!key) return undefined;
	const tool = key.slice("webmcp:".length, -":text".length);
	const code = toolErrorCodeOf(state, tool);
	return code ? { tool, code } : undefined;
}
