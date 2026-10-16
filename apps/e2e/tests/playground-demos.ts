import { OWN_KEYS, SHARED_KEY } from "./playground-env";

export interface PlaygroundDemo {
	/** Folder under apps/docs/static/playground-demos; the <select> option value is derived from it. */
	dir: string;
	name: string;
	/** Exactly the tool names the demo registers (read from the demo's own script). */
	tools: string[];
	/** The publishable key the playground build gives this demo (see playground-env.ts). */
	key: string;
}

export const demoUrl = (demo: PlaygroundDemo) =>
	`/playground-demos/${demo.dir}/index.html`;

export const PLAYGROUND_DEMOS: PlaygroundDemo[] = [
	{
		dir: "basketful",
		name: "Basketful",
		key: SHARED_KEY,
		tools: [
			"choose_store",
			"search_products",
			"add_to_cart",
			"update_cart_item",
			"get_cart",
			"get_staples",
			"update_staples",
			"add_staples_to_cart",
			"add_recipe_to_cart",
			"start_checkout",
			"get_order_status",
		],
	},
	{
		dir: "pizza-maker",
		name: "Pizza Maker",
		key: OWN_KEYS.PIZZA_MAKER,
		tools: [
			"set_pizza_size",
			"set_pizza_style",
			"toggle_layer",
			"add_topping",
			"remove_topping",
			"manage_pizza",
			"share_pizza",
		],
	},
	{
		dir: "explainer",
		name: "Explainer",
		key: SHARED_KEY,
		tools: ["getAvailability", "bookSlot", "cancelBooking"],
	},
	{
		dir: "react-flightsearch",
		name: "Flight Search",
		key: SHARED_KEY,
		tools: ["searchFlights"],
	},
	{
		dir: "ticket-booking",
		name: "CineFlow",
		key: SHARED_KEY,
		tools: ["update_location", "query_content", "select_showtime"],
	},
	{
		dir: "hotel-chain",
		name: "Hotel Chain",
		key: OWN_KEYS.HOTEL_CHAIN,
		tools: ["search_location", "lookup_amenity", "view_hotel"],
	},
];
