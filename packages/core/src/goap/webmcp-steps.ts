import type { ToolIntent } from "./intent-taxonomy";
import { fact, say } from "./step-text";
import type { GoapAction, WorldState } from "./types";

// What the user is told while a WebMCP tool is being used. Texts are written
// per intent, not per tool: any site's "search" tool reads "Ищу «…»…".

/** Argument names a navigation tool takes its destination from. */
const DESTINATION_PARAMS = [
	"url",
	"path",
	"page",
	"href",
	"route",
	"to",
	"target",
];

/** The page a navigation call is about to open, if its arguments name one. */
export function destinationOf(
	args: Record<string, unknown>,
): string | undefined {
	for (const name of DESTINATION_PARAMS) {
		const value = args[name];
		if (typeof value === "string" && value.trim()) return value;
	}
	return undefined;
}

/** A search answer that says nothing matched. */
export const NO_RESULTS =
	/\b(no|zero|0)\s+(products?|results?|items?|matches)\b|nothing (was )?found|not found|не найден/i;

/** `{ru, en}` text that takes the state's language. */
type Text = (state: WorldState) => string;

interface IntentSteps {
	running: Text;
	done: Text;
	/** Defaults to "couldn't: <tool>". */
	failed?: Text;
}

const qty = (state: WorldState) => fact(state, "quantity", "1");
const product = (state: WorldState) =>
	fact(state, "product", fact(state, "query"));

const STEPS: Partial<Record<ToolIntent, (toolName: string) => IntentSteps>> = {
	chooseStore: () => ({
		running: (s) => {
			const store = fact(s, "store");
			return say(s, {
				ru: store ? `Открываю магазин ${store}…` : "Открываю магазин…",
				en: store ? `Opening store ${store}…` : "Opening the store…",
			});
		},
		done: (s) =>
			say(s, {
				ru: `Магазин открыт: ${fact(s, "store")}`,
				en: `Store open: ${fact(s, "store")}`,
			}),
	}),
	navigate: () => ({
		running: (s) =>
			say(s, { ru: "Перехожу на страницу…", en: "Going to the page…" }),
		done: (s) =>
			s.pageAlreadyOpen === true
				? say(s, {
						ru: "Вы уже на этой странице",
						en: "You are already on this page",
					})
				: say(s, { ru: "Страница открыта", en: "Page opened" }),
	}),
	search: (toolName) => ({
		running: (s) =>
			say(s, {
				ru: `Ищу «${fact(s, "query")}»…`,
				en: `Searching for “${fact(s, "query")}”…`,
			}),
		done: (s) => {
			const found = fact(s, "product");
			return say(s, {
				ru: found ? `Нашёл: ${found}` : "Поиск выполнен",
				en: found ? `Found: ${found}` : "Search done",
			});
		},
		failed: (s) =>
			NO_RESULTS.test(fact(s, `webmcp:${toolName}:text`))
				? say(s, {
						ru: `Ничего не нашёл по запросу «${fact(s, "query")}»`,
						en: `Nothing found for “${fact(s, "query")}”`,
					})
				: say(s, { ru: "Не удалось выполнить поиск", en: "The search failed" }),
	}),
	addToCart: () => ({
		running: (s) =>
			say(s, {
				ru: `Добавляю в корзину: ${qty(s)} × ${product(s)}…`,
				en: `Adding to cart: ${qty(s)} × ${product(s)}…`,
			}),
		done: (s) =>
			say(s, {
				ru: `Добавлено в корзину: ${qty(s)} × ${product(s)}`,
				en: `Added to cart: ${qty(s)} × ${product(s)}`,
			}),
		failed: (s) =>
			say(s, {
				ru: `Не удалось добавить в корзину: ${product(s)}`,
				en: `Couldn't add to cart: ${product(s)}`,
			}),
	}),
};

/** The `describe` of a tool action: its intent's wording, or a generic one by tool name. */
export function describeTool(
	tool: { name: string; title?: string },
	intent: ToolIntent,
): NonNullable<GoapAction["describe"]> {
	const label = tool.title || tool.name;
	const steps: IntentSteps = STEPS[intent]?.(tool.name) ?? {
		running: (s) =>
			say(s, { ru: `Выполняю: ${label}…`, en: `Running: ${label}…` }),
		done: (s) => say(s, { ru: `Готово: ${label}`, en: `Done: ${label}` }),
	};
	return (state, phase) => {
		if (phase === "running") return steps.running(state);
		if (phase === "done") return steps.done(state);
		return (
			steps.failed?.(state) ??
			say(state, { ru: `Не удалось: ${label}`, en: `Failed: ${label}` })
		);
	};
}

// --- choosing an enum parameter ------------------------------------------

const PARAMETER_WORDS: Record<
	string,
	{ ru: [string, string]; en: [string, string] }
> = {
	store: {
		ru: ["Выбираю магазин…", "Выбран магазин"],
		en: ["Choosing a store…", "Store chosen"],
	},
};

/** The `describe` of the Laya step that picks a value for `parameter`. */
export function describeParameterChoice(
	parameter: string,
): NonNullable<GoapAction["describe"]> {
	return (state, phase) => {
		const words = PARAMETER_WORDS[parameter];
		const [running, chosen] = words
			? say(state, words)
			: say(state, {
					ru: [`Выбираю «${parameter}»…`, `Выбрано «${parameter}»`] as [
						string,
						string,
					],
					en: [`Choosing “${parameter}”…`, `Chosen “${parameter}”`] as [
						string,
						string,
					],
				});
		if (phase === "running") return running;
		if (phase === "done") return `${chosen}: ${fact(state, parameter)}`;
		return say(state, {
			ru: `Не удалось выбрать «${parameter}»`,
			en: `Couldn't choose “${parameter}”`,
		});
	};
}
