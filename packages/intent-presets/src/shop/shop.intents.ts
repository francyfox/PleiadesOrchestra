import type { IntentDef } from "../preset.ts";

/**
 * The intents of an online shop. Descriptions are one short English line each
 * (Laya reads English; "go to the Greenleaf market" came back as `checkout` from
 * a bare label), and short on purpose: Laya shares one 192-token budget between
 * all options of a question.
 *
 * `preconditions` are a best-effort ordering heuristic, not a guarantee: a
 * tool's real dependency order is not recoverable from its name and description.
 * A plan that gets it wrong costs one extra tool call (the executor replans).
 */
export const SHOP_INTENTS: Record<string, IntentDef> = {
	chooseStore: {
		description: "go to or switch to a particular store",
		preconditions: {},
		effects: { storeOpen: true },
	},
	navigate: {
		description: "open a page of the site: cart, orders",
		preconditions: {},
		effects: { pageOpened: true },
	},
	search: {
		description: "look for products or ask what is available",
		// `requestParsed`: what to look for was pulled out of the message first (`product-request.ts`).
		preconditions: { storeOpen: true, requestParsed: true },
		effects: { catalogSearched: true },
	},
	filter: {
		description: "narrow products by diet, price or department",
		preconditions: { catalogSearched: true },
		effects: { catalogFiltered: true },
	},
	select: {
		description: "open or pick one product from the results",
		preconditions: { catalogSearched: true },
		effects: { itemSelected: true },
	},
	addToCart: {
		description: "buy a product or put it in the cart",
		preconditions: {
			storeOpen: true,
			catalogSearched: true,
			requestParsed: true,
		},
		effects: { inCart: true },
	},
	removeFromCart: {
		description: "take a product out of the cart",
		preconditions: { storeOpen: true },
		effects: { inCart: false },
		needsWords: true,
	},
	checkout: {
		description: "pay and place the order",
		preconditions: { inCart: true },
		effects: { checkoutComplete: true },
		needsWords: true,
	},
	paginate: {
		description: "show more results, next page",
		preconditions: {},
		effects: {},
	},
	compare: {
		description: "compare two or more products",
		preconditions: {},
		effects: {},
	},
	// A tool's role (read the current list, so a request about «every item» knows the items),
	// recognised by the tool's name; a shopper never asks for it.
	readState: {
		description: "only read what the site holds now: the cart, bookings",
		preconditions: { storeOpen: true },
		effects: { listRead: true },
		toolRole: true,
	},
	other: {
		description: "anything else",
		preconditions: {},
		effects: {},
	},
};
