import type { ToolSpec } from "../delta/delta.types.ts";
import type { ComplexCase } from "./tools.types.ts";

// The complex check: one request per site that needs every kind of argument
// at once — product words (query), terms chosen by meaning (keywords), a pick
// from a list (enum), a yes/no (boolean), a number. Scored per field and per
// kind of field, apart from the main table. Each field names the words of the
// request it comes from (`source`), which the report colours by kind.
//
// Shop-domain layer: the sites, schemas and requests below are fixtures. They
// vary the domain on purpose (CLAUDE.md "Domain: not one shop").

const object = (properties: Record<string, unknown>) =>
	({ type: "object", properties }) as ToolSpec["inputSchema"];

const text = (description: string) => ({ type: "string", description });
const list = (description: string) => ({
	type: "array",
	items: { type: "string" },
	description,
});
const oneOf = (values: string[], description: string) => ({
	type: "string",
	enum: values,
	description,
});
const flag = (description: string) => ({ type: "boolean", description });
const amount = (type: "number" | "integer", description: string) => ({
	type,
	description,
});

export const COMPLEX_CASES: ComplexCase[] = [
	{
		id: "groceries-curry-night",
		domain: "groceries",
		tool: {
			name: "search_products",
			description:
				"Search the store's catalog. Every filter is optional; combine them.",
			inputSchema: object({
				query: text("Product words, e.g. 'oat milk'."),
				ingredients: list(
					"For a dish: what it calls for, e.g. 'pasta', 'tomatoes', 'basil' for a tomato pasta.",
				),
				dietary: oneOf(
					["organic", "vegan", "gluten-free", "dairy-free"],
					"Only products that meet this dietary need.",
				),
				in_stock_only: flag("Leave out what is sold out."),
				servings: amount("integer", "How many people the food is for."),
			}),
		},
		request:
			"Planning a Thai green curry night for 6 people, everything vegan, skip anything out of stock",
		fields: {
			ingredients: {
				kind: "keywords",
				source: "Thai green curry",
				mustInclude: [
					["coconut"],
					["paste", "lemongrass", "galangal", "chili", "chilli", "lime"],
					["rice", "noodle"],
				],
				maxItems: 15,
			},
			servings: { kind: "number", source: "6 people", value: 6 },
			dietary: { kind: "enum", source: "vegan", value: "vegan" },
			in_stock_only: {
				kind: "boolean",
				source: "skip anything out of stock",
				value: true,
			},
		},
		free: ["query"],
	},
	{
		id: "electronics-editing-laptop",
		domain: "electronics",
		tool: {
			name: "search_products",
			description: "Search the catalog of an electronics shop.",
			inputSchema: object({
				query: text("Product words, e.g. 'usb-c charger'."),
				features: list(
					"Specs the use calls for, e.g. 'lightweight', 'noise cancelling'.",
				),
				sort: oneOf(
					["relevance", "price_low", "price_high", "rating"],
					"Order of the results.",
				),
				include_refurbished: flag("Also show refurbished items."),
				max_price: amount("number", "Highest price in euros."),
			}),
		},
		request:
			"A laptop for editing 4K video on long train rides, refurbished is fine, cheapest first, up to 900 euros",
		fields: {
			query: {
				kind: "query",
				source: "laptop",
				words: [["laptop", "notebook"]],
				maxWords: 3,
			},
			features: {
				kind: "keywords",
				source: "editing 4K video on long train rides",
				mustInclude: [
					["gpu", "graphics", "rtx", "geforce", "radeon"],
					["battery"],
				],
				maxItems: 8,
			},
			include_refurbished: {
				kind: "boolean",
				source: "refurbished is fine",
				value: true,
			},
			sort: { kind: "enum", source: "cheapest first", value: "price_low" },
			max_price: { kind: "number", source: "900 euros", value: 900 },
		},
	},
	{
		id: "clothing-iceland-jacket",
		domain: "clothing",
		tool: {
			name: "search_products",
			description: "Search a clothing shop's catalog.",
			inputSchema: object({
				query: text("Product words, e.g. 'linen shirt'."),
				features: list(
					"What it should be made for or of, e.g. 'breathable', 'merino'.",
				),
				size: oneOf(["XS", "S", "M", "L", "XL"], "Size to show."),
				new_arrivals_only: flag("Only items added this season."),
			}),
		},
		request: "A jacket for a winter hike in Iceland, size M, only new arrivals",
		fields: {
			query: {
				kind: "query",
				source: "jacket",
				words: [["jacket", "coat", "parka", "shell"]],
				maxWords: 3,
			},
			features: {
				kind: "keywords",
				source: "winter hike in Iceland",
				mustInclude: [
					["waterproof", "water-resistant", "gore-tex", "rain"],
					["insulat", "down", "fleece", "thermal", "warm", "padded"],
				],
				maxItems: 8,
			},
			size: { kind: "enum", source: "size M", value: "M" },
			new_arrivals_only: {
				kind: "boolean",
				source: "only new arrivals",
				value: true,
			},
		},
	},
	{
		id: "books-gift-for-dad",
		domain: "books",
		tool: {
			name: "search_books",
			description: "Search a bookshop's catalog.",
			inputSchema: object({
				query: text("Title, author or subject words."),
				genres: list("Genres and themes to look for, e.g. 'cozy mystery'."),
				format: oneOf(
					["hardcover", "paperback", "ebook", "audiobook"],
					"Edition format.",
				),
				gift_wrap: flag("Wrap it as a present."),
				max_price: amount("number", "Highest price in dollars."),
			}),
		},
		request:
			"A gift for my dad who loved Dune, as an audiobook he can play while driving, under 20 dollars",
		fields: {
			gift_wrap: { kind: "boolean", source: "A gift", value: true },
			genres: {
				kind: "keywords",
				source: "loved Dune",
				mustInclude: [
					["science fiction", "sci-fi", "scifi", "space opera", "fantasy"],
				],
				maxItems: 6,
			},
			format: { kind: "enum", source: "audiobook", value: "audiobook" },
			max_price: { kind: "number", source: "20 dollars", value: 20 },
		},
		free: ["query"],
	},
	{
		id: "travel-lisbon-stay",
		domain: "travel",
		tool: {
			name: "search_stays",
			description: "Find a place to stay.",
			inputSchema: object({
				query: text("Where: a city or an area."),
				amenities: list("What the place must have, e.g. 'parking', 'kitchen'."),
				area: oneOf(
					["city center", "quiet residential", "beach", "airport"],
					"Kind of neighbourhood.",
				),
				pets_allowed: flag("Only places that take pets."),
				guests: amount("integer", "How many people stay."),
			}),
		},
		request:
			"A quiet place in Lisbon for me and my partner, we're bringing our dog and both work remotely",
		fields: {
			area: { kind: "enum", source: "quiet place", value: "quiet residential" },
			query: {
				kind: "query",
				source: "Lisbon",
				words: [["lisbon"]],
				maxWords: 3,
			},
			guests: { kind: "number", source: "me and my partner", value: 2 },
			pets_allowed: {
				kind: "boolean",
				source: "bringing our dog",
				value: true,
			},
			amenities: {
				kind: "keywords",
				source: "both work remotely",
				mustInclude: [
					["wifi", "wi-fi", "internet"],
					["desk", "workspace", "office", "work space"],
				],
				maxItems: 6,
			},
		},
	},
	{
		id: "hardware-dripping-tap",
		domain: "hardware",
		tool: {
			name: "search_products",
			description: "Search a hardware store's catalog.",
			inputSchema: object({
				query: text("Product words, e.g. 'wood screws'."),
				parts: list("Parts and tools the job needs, e.g. 'pipe wrench'."),
				fulfillment: oneOf(
					["delivery", "store pickup"],
					"How the order reaches the customer.",
				),
			}),
		},
		request:
			"Need to fix a dripping kitchen tap this weekend, I'd rather pick it up in store",
		fields: {
			parts: {
				kind: "keywords",
				source: "fix a dripping",
				mustInclude: [
					["washer", "cartridge", "o-ring", "seal"],
					["wrench", "spanner", "pliers", "screwdriver"],
				],
				maxItems: 8,
			},
			query: {
				kind: "query",
				source: "tap",
				words: [["tap", "faucet"]],
				maxWords: 4,
			},
			fulfillment: {
				kind: "enum",
				source: "pick it up in store",
				value: "store pickup",
			},
		},
	},
];
