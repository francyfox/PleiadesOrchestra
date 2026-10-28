import type { ConversationMessage } from "#core/goap/understanding";

/**
 * Messages that follow the assistant's own reply, for `eval/answers.ts`.
 * `history` ends with that reply (the one the message may answer); `expected`
 * is a tool of the site, `chat`, or `options:<tool>` (choose-tool-cases.ts).
 *   answer  a short answer that only makes sense with the reply;
 *   topic   a message that stands on its own: the reply must be ignored;
 *   chain   an answer whose action was said several messages earlier.
 * Sites and tools are TOOL_CHOICE_SITES'.
 */
export interface AnswerCase {
	kind: "answer" | "topic" | "chain";
	site: string;
	history: ConversationMessage[];
	message: string;
	expected: string;
}

const PIZZA = "Pizza Maker";
const SHOP = "Basketful (groceries)";
const CINEMA = "CineFlow (cinema)";
const BOOKING = "Consultation booking";

const user = (content: string): ConversationMessage => ({
	role: "user",
	content,
});
const assistant = (content: string): ConversationMessage => ({
	role: "assistant",
	content,
});

const SIZES = [
	user("what sizes are there?"),
	assistant(
		"We have these sizes:\n1. Small\n2. Medium\n3. Large\n4. Extra Large",
	),
];
const TOPPINGS = [
	user("add tomatoes"),
	assistant(
		"Tomatoes are not on the list. You can pick:\n1. 🍄 Mushrooms\n2. 🫒 Olives\n3. 🌽 Corn",
	),
];
const STORES = [
	user("I want to order groceries"),
	assistant(
		"I can open one of these stores:\n1. Greenleaf Market (fastest)\n2. Harbor Foods Co-op (organic)\n3. Penny Pantry (lowest prices)",
	),
];
const JUICE = [
	user("хочу купить томат"),
	assistant("We have no tomatoes. Can I offer tomato juice instead?"),
];
const BREAD = [
	user("find gluten-free bread"),
	assistant(
		"Found:\n1. Rustic Gluten-Free Loaf\n2. Seeded GF Bread\nShould I add one to the cart?",
	),
];
const ADDED = [
	user("add whole milk"),
	assistant("Added Whole Milk to the cart. Anything else?"),
];
const GENRES = [
	user("what's on tonight?"),
	assistant("Which genre would you like?\n1. Horror\n2. Comedy\n3. Drama"),
];
const TIMES = [
	user("book a consultation on 2026-11-03"),
	assistant(
		"Free times on 2026-11-03: 10:00, 14:00, 16:30. Which one should I book?",
	),
];

export const ANSWER_CASES: AnswerCase[] = [
	// A short answer: only the reply says what it means.
	{
		kind: "answer",
		site: PIZZA,
		history: SIZES,
		message: "Large",
		expected: "set_pizza_size",
	},
	{
		kind: "answer",
		site: PIZZA,
		history: SIZES,
		message: "3",
		expected: "set_pizza_size",
	},
	{
		kind: "answer",
		site: PIZZA,
		history: SIZES,
		message: "большую",
		expected: "set_pizza_size",
	},
	{
		kind: "answer",
		site: PIZZA,
		history: TOPPINGS,
		message: "грибы",
		expected: "add_topping",
	},
	{
		kind: "answer",
		site: PIZZA,
		history: TOPPINGS,
		message: "2",
		expected: "add_topping",
	},
	{
		kind: "answer",
		site: SHOP,
		history: STORES,
		message: "2",
		expected: "choose_store",
	},
	{
		kind: "answer",
		site: SHOP,
		history: STORES,
		message: "the cheapest one",
		expected: "choose_store",
	},
	{
		kind: "answer",
		site: SHOP,
		history: JUICE,
		message: "да",
		expected: "add_to_cart",
	},
	{
		kind: "answer",
		site: SHOP,
		history: BREAD,
		message: "первый",
		expected: "add_to_cart",
	},
	{
		kind: "answer",
		site: CINEMA,
		history: GENRES,
		message: "comedy",
		expected: "query_content",
	},
	{
		kind: "answer",
		site: BOOKING,
		history: TIMES,
		message: "the 2pm one",
		expected: "bookSlot",
	},
	{
		kind: "answer",
		site: BOOKING,
		history: TIMES,
		message: "давай на 16:30",
		expected: "bookSlot",
	},

	// Another topic: the reply must not leak into the request.
	{
		kind: "topic",
		site: PIZZA,
		history: SIZES,
		message: "give me a link to share it",
		expected: "share_pizza",
	},
	{
		kind: "topic",
		site: PIZZA,
		history: SIZES,
		message: "remove the cheese",
		expected: "toggle_layer",
	},
	{
		kind: "topic",
		site: PIZZA,
		history: SIZES,
		message: "which toppings do you have?",
		expected: "options:add_topping",
	},
	{
		kind: "topic",
		site: PIZZA,
		history: SIZES,
		message: "привет",
		expected: "chat",
	},
	{
		kind: "topic",
		site: PIZZA,
		history: TOPPINGS,
		message: "thanks, that's all",
		expected: "chat",
	},
	{
		kind: "topic",
		site: PIZZA,
		history: TOPPINGS,
		message: "make it BBQ style",
		expected: "set_pizza_style",
	},
	{
		kind: "topic",
		site: PIZZA,
		history: TOPPINGS,
		message: "начни заново",
		expected: "manage_pizza",
	},
	{
		kind: "topic",
		site: SHOP,
		history: STORES,
		message: "what's in my cart?",
		expected: "get_cart",
	},
	{
		kind: "topic",
		site: SHOP,
		history: STORES,
		message: "where is my order?",
		expected: "get_order_status",
	},
	{
		kind: "topic",
		site: SHOP,
		history: JUICE,
		message: "нет, спасибо",
		expected: "chat",
	},
	{
		kind: "topic",
		site: SHOP,
		history: JUICE,
		message: "а огурцы есть?",
		expected: "search_products",
	},
	{
		kind: "topic",
		site: SHOP,
		history: ADDED,
		message: "add my staples too",
		expected: "add_staples_to_cart",
	},
	{
		kind: "topic",
		site: SHOP,
		history: ADDED,
		message: "change the milk to 3",
		expected: "update_cart_item",
	},
	{
		kind: "topic",
		site: CINEMA,
		history: GENRES,
		message: "I'm in Berlin now",
		expected: "update_location",
	},
	{
		kind: "topic",
		site: CINEMA,
		history: GENRES,
		message: "no thanks",
		expected: "chat",
	},
	{
		kind: "topic",
		site: CINEMA,
		history: GENRES,
		message: "two tickets for Dune at 8:30 PM",
		expected: "select_showtime",
	},
	{
		kind: "topic",
		site: BOOKING,
		history: TIMES,
		message: "what is free on Friday?",
		expected: "getAvailability",
	},
	{
		kind: "topic",
		site: BOOKING,
		history: TIMES,
		message: "отмена, не надо",
		expected: "chat",
	},

	// A chain: the action was asked for several messages before the answer.
	{
		kind: "chain",
		site: SHOP,
		history: [
			user("хочу купить томат"),
			assistant("We have no tomatoes. Tomato juice or ketchup?"),
			user("а какой сок есть?"),
			assistant("We have:\n1. Tomato Juice 1L\n2. Organic Tomato Juice 0.5L"),
		],
		message: "второй",
		expected: "add_to_cart",
	},
	{
		kind: "chain",
		site: PIZZA,
		history: [
			user("I need a pizza for a party"),
			assistant("How many people will eat?"),
			user("about 10"),
			assistant("For 10 people I'd suggest:\n1. Large\n2. Extra Large"),
		],
		message: "the bigger one",
		expected: "set_pizza_size",
	},
	{
		kind: "chain",
		site: BOOKING,
		history: [
			user("book me a consultation next week"),
			assistant("Which day? Free: Monday 2026-11-02, Wednesday 2026-11-04"),
			user("what times on Wednesday?"),
			assistant("Wednesday 2026-11-04: 10:00, 14:00"),
		],
		message: "14:00 подойдёт",
		expected: "bookSlot",
	},
	{
		kind: "chain",
		site: CINEMA,
		history: [
			user("I want to watch a movie tonight"),
			assistant("Which city are you in?"),
			user("Paris"),
			assistant("Which genre?\n1. Horror\n2. Comedy\n3. Drama"),
		],
		message: "horror",
		expected: "query_content",
	},
	{
		kind: "chain",
		site: SHOP,
		history: [
			user("I want to cook tacos tonight"),
			assistant(
				"I can add a whole recipe. Which one?\n1. Weeknight Beef Tacos\n2. Guacamole & Chips",
			),
			user("what's in the first one?"),
			assistant(
				"Weeknight Beef Tacos: ground beef, taco shells, cheddar, lettuce, salsa. Add it?",
			),
		],
		message: "yes please",
		expected: "add_recipe_to_cart",
	},
	{
		kind: "chain",
		site: SHOP,
		history: [
			user("хочу купить томат"),
			assistant("We have no tomatoes. Tomato juice or ketchup?"),
			user("а какой сок есть?"),
			assistant("We have:\n1. Tomato Juice 1L\n2. Organic Tomato Juice 0.5L"),
		],
		message: "where is my order?",
		expected: "get_order_status",
	},
];
