import type { ToolIntent } from "#core/goap/intent-taxonomy";
import {
	LIST_EMPTY,
	LISTED_ITEMS,
	REMOVED_ITEMS,
} from "#core/goap/list-removal";
import {
	FOUND_ITEMS,
	itemsText,
	MISSING_ITEMS,
	readItems,
} from "#core/goap/shopping-list";
import { fact, say } from "#core/goap/step-text";
import type { GoapAction, WorldState } from "#core/goap/types";

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
/** «2 × A, 1 × B» when several things were found, else the single `qty × product`. */
const cartLine = (state: WorldState) => {
	const found = readItems(state, FOUND_ITEMS);
	return found.length > 1
		? itemsText(found)
		: `${qty(state)} × ${product(state)}`;
};

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
		running: (s) => {
			const query = fact(s, "query");
			return say(s, {
				ru: query ? `Ищу «${query}»…` : "Ищу товар…",
				en: query ? `Searching for “${query}”…` : "Searching…",
			});
		},
		done: (s) => {
			const list = readItems(s, FOUND_ITEMS);
			const missing = readItems(s, MISSING_ITEMS).map((item) => item.name);
			const found =
				list.length > 1 || missing.length > 0
					? list.map((item) => item.name).join(", ")
					: fact(s, "product");
			const notFound = missing.length > 0 ? missing.join(", ") : "";
			return say(s, {
				ru: found
					? `Нашёл: ${found}${notFound ? `. Не нашёл: ${notFound}` : ""}`
					: "Поиск выполнен",
				en: found
					? `Found: ${found}${notFound ? `. Not found: ${notFound}` : ""}`
					: "Search done",
			});
		},
		failed: (s) =>
			NO_RESULTS.test(fact(s, `webmcp:${toolName}:text`))
				? say(s, {
						ru: fact(s, "query")
							? `Ничего не нашёл по запросу «${fact(s, "query")}»`
							: "Ничего не нашёл",
						en: fact(s, "query")
							? `Nothing found for “${fact(s, "query")}”`
							: "Nothing found",
					})
				: say(s, { ru: "Не удалось выполнить поиск", en: "The search failed" }),
	}),
	addToCart: () => ({
		running: (s) =>
			say(s, {
				ru: `Добавляю в корзину: ${cartLine(s)}…`,
				en: `Adding to cart: ${cartLine(s)}…`,
			}),
		done: (s) =>
			say(s, {
				ru: `Добавлено в корзину: ${cartLine(s)}`,
				en: `Added to cart: ${cartLine(s)}`,
			}),
		failed: (s) =>
			say(s, {
				ru: `Не удалось добавить в корзину: ${product(s)}`,
				en: `Couldn't add to cart: ${product(s)}`,
			}),
	}),
};

/** Items of a list fact as «2 × A, 1 × B», or `""`. */
const listText = (state: WorldState, key: string) =>
	itemsText(readItems(state, key));

STEPS.removeFromCart = () => ({
	running: (s) => {
		const all = listText(s, LISTED_ITEMS);
		const one = fact(s, "product");
		return say(s, {
			ru: all
				? `Убираю из корзины: ${all}…`
				: one
					? `Убираю из корзины: ${one}…`
					: "Убираю из корзины…",
			en: all
				? `Removing from the cart: ${all}…`
				: one
					? `Removing from the cart: ${one}…`
					: "Removing from the cart…",
		});
	},
	done: (s) => {
		const removed = listText(s, REMOVED_ITEMS);
		if (s[LIST_EMPTY] === true) {
			return say(s, { ru: "Там уже пусто", en: "It is already empty" });
		}
		return say(s, {
			ru: removed ? `Убрано из корзины: ${removed}` : "Убрано из корзины",
			en: removed
				? `Removed from the cart: ${removed}`
				: "Removed from the cart",
		});
	},
	failed: (s) =>
		say(s, {
			ru: "Не удалось убрать из корзины",
			en: "Couldn't remove from the cart",
		}),
});

STEPS.readState = () => ({
	running: (s) =>
		say(s, { ru: "Смотрю, что там сейчас…", en: "Checking what is there…" }),
	done: (s) => {
		const listed = readItems(s, LISTED_ITEMS).length;
		return say(s, {
			ru: s[LIST_EMPTY] === true ? "Там пусто" : `Нашёл позиций: ${listed}`,
			en: s[LIST_EMPTY] === true ? "It is empty" : `Found ${listed} items`,
		});
	},
});

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
