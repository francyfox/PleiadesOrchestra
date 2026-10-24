export interface DecompositionCase {
	message: string;
	/** Tasks in the order the message says them; `after` = index of the task it follows. */
	expected: { intent: string; after?: number }[];
}

const t = (intent: string, after?: number) =>
	after === undefined ? { intent } : { intent, after };

/** English only (delta reads the translation). Intents are the shop taxonomy's; the domains vary on purpose. */
export const DECOMPOSITION_CASES: DecompositionCase[] = [
	// one task
	{ message: "find me a gluten free bread", expected: [t("search")] },
	{ message: "show laptops under 800 dollars", expected: [t("search")] },
	{
		message: "add the blue running shoes to my cart",
		expected: [t("addToCart")],
	},
	{ message: "I want to pay for my order now", expected: [t("checkout")] },
	{
		message: "take the paperback out of my basket",
		expected: [t("removeFromCart")],
	},
	{
		message: "go to the checkout page and open my orders",
		expected: [t("navigate")],
	},
	{ message: "compare these two phones", expected: [t("compare")] },
	{ message: "show the next page of results", expected: [t("paginate")] },
	// independent tasks
	{
		message: "look for oat milk and also show me the cart page",
		expected: [t("search"), t("navigate")],
	},
	{
		message: "find a hotel in Rome and a flight to Paris",
		expected: [t("search"), t("search")],
	},
	{
		message: "add a USB cable to the cart and compare two monitors",
		expected: [t("addToCart"), t("compare")],
	},
	{
		message:
			"switch to the downtown store, search for a winter jacket and open my orders",
		expected: [t("chooseStore"), t("search"), t("navigate")],
	},
	{
		message: "search for a cookbook, a notebook and a pen",
		expected: [t("search"), t("search"), t("search")],
	},
	// ordered tasks
	{
		message: "find a red dress, then add it to the cart",
		expected: [t("search"), t("addToCart", 0)],
	},
	{
		message: "search for a wireless mouse and after that buy it",
		expected: [t("search"), t("addToCart", 0)],
	},
	{
		message: "find a novel by Tolstoy, add it to the cart and then check out",
		expected: [t("search"), t("addToCart", 0), t("checkout", 1)],
	},
	{
		message: "open the sale page and then show only items under 20 dollars",
		expected: [t("navigate"), t("filter", 0)],
	},
	{
		message: "look up a tent for two people, then take a look at the first one",
		expected: [t("search"), t("select", 0)],
	},
	{
		message: "add the headphones to the cart, then pay for the order",
		expected: [t("addToCart"), t("checkout", 0)],
	},
	// conflicting tasks
	{
		message: "add a sofa to the cart and then clear the cart",
		expected: [t("addToCart"), t("removeFromCart", 0)],
	},
	{
		message: "remove the socks from my cart and after that add the scarf",
		expected: [t("removeFromCart"), t("addToCart", 0)],
	},
	{
		message: "add a toaster to the cart and empty the cart",
		expected: [t("addToCart"), t("removeFromCart")],
	},
	{
		message:
			"first clear my basket, then search for garden gloves and buy them",
		expected: [t("removeFromCart"), t("search", 0), t("addToCart", 1)],
	},
	// chit-chat, no task
	{ message: "hello there", expected: [t("other")] },
	{ message: "thanks, that was helpful", expected: [t("other")] },
	{ message: "what can you do?", expected: [t("other")] },
	{ message: "how are you today", expected: [t("other")] },
	// generic site actions, other domains
	{
		message: "book a table for two on Friday and then show my reservations",
		expected: [t("other"), t("navigate", 0)],
	},
	{
		message: "find a train ticket to Berlin, then compare it with the bus",
		expected: [t("search"), t("compare", 0)],
	},
	{
		message: "go to the settings page",
		expected: [t("navigate")],
	},
	// a read of what the site holds, seen dropped in the demo (2026-10-24)
	{
		message: "add a milk to my cart and show me the cart",
		expected: [t("addToCart"), t("readState")],
	},
	{
		message: "add a Samsung phone to my cart and show me the cart",
		expected: [t("addToCart"), t("readState")],
	},
	{
		message: "book the 7pm table and show my bookings",
		expected: [t("addToCart"), t("readState")],
	},
];
