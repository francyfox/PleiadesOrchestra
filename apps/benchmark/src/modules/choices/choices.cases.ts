import type { ToolSpec } from "../delta/delta.types.ts";
import type { LayaCase } from "./choices.types.ts";

// Laya's share of a tool call (`tools --laya`): the enums and booleans of a
// request, nothing else. Each field is either given (in the request's own
// words, rarely the value's), unsaid (must stay out) or refused ("skip the
// t-shirt": out or false).
//
// Shop-domain layer: the sites, schemas and requests are fixtures, varied on
// purpose (CLAUDE.md "Domain: not one shop"). English: alpha-understand translates first.

const tool = (
	name: string,
	properties: Record<string, unknown>,
	required: string[] = [],
): ToolSpec => ({
	name,
	description: "",
	inputSchema: { type: "object", properties, required },
});
const oneOf = (values: string[], description: string) => ({
	type: "string",
	enum: values,
	description,
});
const flag = (description: string) => ({ type: "boolean", description });
const text = (description: string) => ({ type: "string", description });

const FOOD = tool("order_food", {
	dish: text("What to order."),
	spice: oneOf(["mild", "medium", "hot"], "How spicy."),
	delivery: oneOf(
		["delivery", "pickup"],
		"How the order reaches the customer.",
	),
	contactless: flag("Leave the order at the door, no handover."),
	cutlery: flag("Include plastic cutlery."),
});

const CINEMA = tool("book_tickets", {
	format: oneOf(["2D", "3D", "IMAX"], "Screening format."),
	seat_zone: oneOf(["front", "middle", "back"], "Where in the hall."),
	wheelchair: flag("Wheelchair-accessible seats."),
});

const CAR = tool("rent_car", {
	transmission: oneOf(["manual", "automatic"], "Gearbox."),
	size: oneOf(["compact", "midsize", "SUV", "van"], "Car class."),
	child_seat: flag("Add a child seat."),
	full_insurance: flag("Full coverage insurance, no excess."),
});

const PHARMACY = tool("search_medicine", {
	query: text("What it is for."),
	form: oneOf(["tablet", "syrup", "spray", "cream"], "Dosage form."),
	age_group: oneOf(["adult", "child"], "Who takes it."),
	prescription_free: flag("Only over-the-counter, no prescription needed."),
});

const FURNITURE = tool("search_furniture", {
	query: text("Item."),
	material: oneOf(["wood", "metal", "glass", "fabric"], "Main material."),
	room: oneOf(["living room", "bedroom", "kitchen", "office"], "Room."),
	assembly: flag("Assembly service included."),
});

const PETS = tool("search_pet_food", {
	animal: oneOf(["dog", "cat", "bird", "fish"], "Which pet."),
	life_stage: oneOf(["young", "adult", "senior"], "Age of the pet."),
	grain_free: flag("Without grain."),
});

const SAAS = tool("create_subscription", {
	plan: oneOf(["free", "team", "enterprise"], "Plan."),
	billing: oneOf(["monthly", "yearly"], "Billing period."),
	trial: flag("Start with a free trial."),
});

const CONCERT = tool("buy_concert_tickets", {
	section: oneOf(["standing", "seated", "vip"], "Ticket type."),
	accessible: flag("Accessible area."),
	merch_bundle: flag("Add the T-shirt bundle."),
});

const GROCERIES = tool("search_products", {
	query: text("Product words."),
	dietary: oneOf(
		["organic", "vegan", "gluten-free", "dairy-free"],
		"Dietary need.",
	),
	in_stock_only: flag("Leave out what is sold out."),
});

const STAYS = tool("search_stays", {
	query: text("Where."),
	area: oneOf(
		["city center", "quiet residential", "beach", "airport"],
		"Kind of neighbourhood.",
	),
	pets_allowed: flag("Only places that take pets."),
});

const CLOTHING = tool("search_clothes", {
	query: text("Item."),
	size: oneOf(["XS", "S", "M", "L", "XL"], "Size."),
	fit: oneOf(["slim", "regular", "relaxed"], "Cut."),
	new_arrivals_only: flag("Only items added this season."),
});

const ELECTRONICS = tool("search_electronics", {
	query: text("Product words."),
	sort: oneOf(
		["relevance", "price_low", "price_high", "rating"],
		"Order of the results.",
	),
	include_refurbished: flag("Also show refurbished items."),
});

export const LAYA_CASES: LayaCase[] = [
	// --- food delivery ---------------------------------------------------------
	{
		id: "food-hot-door",
		domain: "food delivery",
		tool: FOOD,
		request: "Spicy noodles, as fiery as you make them, leave it at the door",
		expected: {
			spice: "hot",
			delivery: null,
			contactless: true,
			cutlery: null,
		},
	},
	{
		id: "food-pickup-no-forks",
		domain: "food delivery",
		tool: FOOD,
		request: "I'll come and get it myself, mild curry, no need for forks",
		expected: {
			spice: "mild",
			delivery: "pickup",
			contactless: null,
			cutlery: false,
		},
	},
	{
		id: "food-plain",
		domain: "food delivery",
		tool: FOOD,
		request: "Two margherita pizzas please",
		expected: { spice: null, delivery: null, contactless: null, cutlery: null },
	},

	// --- cinema --------------------------------------------------------------
	{
		id: "cinema-giant-screen-back",
		domain: "cinema",
		tool: CINEMA,
		request:
			"Two tickets for the giant-screen version, somewhere in the last rows",
		expected: { format: "IMAX", seat_zone: "back", wheelchair: null },
	},
	{
		id: "cinema-wheelchair",
		domain: "cinema",
		tool: CINEMA,
		request:
			"My grandmother uses a wheelchair, a regular flat screening is fine",
		expected: { format: "2D", seat_zone: null, wheelchair: true },
	},
	{
		id: "cinema-plain",
		domain: "cinema",
		tool: CINEMA,
		request: "Tickets for tonight's show",
		expected: { format: null, seat_zone: null, wheelchair: null },
	},

	// --- car rental -----------------------------------------------------------
	{
		id: "car-no-stick-seven",
		domain: "car rental",
		tool: CAR,
		request: "I can't drive stick, we are seven people with luggage",
		expected: {
			transmission: "automatic",
			size: "van",
			child_seat: null,
			full_insurance: null,
		},
	},
	{
		id: "car-small-toddler",
		domain: "car rental",
		tool: CAR,
		request: "Something small for city parking, our toddler comes too",
		expected: {
			transmission: null,
			size: "compact",
			child_seat: true,
			full_insurance: null,
		},
	},
	{
		id: "car-suv-no-worries",
		domain: "car rental",
		tool: CAR,
		request: "An SUV, and I don't want to pay a cent if it gets scratched",
		expected: {
			transmission: null,
			size: "SUV",
			child_seat: null,
			full_insurance: true,
		},
	},
	{
		id: "car-manual-no-extras",
		domain: "car rental",
		tool: CAR,
		request: "A manual is fine, no extras at all",
		expected: {
			transmission: "manual",
			size: null,
			child_seat: false,
			full_insurance: false,
		},
	},

	// --- pharmacy ---------------------------------------------------------------
	{
		id: "pharmacy-kid-cough",
		domain: "pharmacy",
		tool: PHARMACY,
		request: "Something for my 4-year-old's cough, she can't swallow pills",
		expected: { form: "syrup", age_group: "child", prescription_free: null },
	},
	{
		id: "pharmacy-rash-no-doctor",
		domain: "pharmacy",
		tool: PHARMACY,
		request:
			"Something to rub on an itchy rash that I can buy without seeing a doctor",
		expected: { form: "cream", age_group: null, prescription_free: true },
	},

	// --- furniture ------------------------------------------------------------
	{
		id: "furniture-oak-desk",
		domain: "furniture",
		tool: FURNITURE,
		request: "A solid oak desk for working from home, I'm hopeless with tools",
		expected: { material: "wood", room: "office", assembly: true },
	},
	{
		id: "furniture-glass-kitchen",
		domain: "furniture",
		tool: FURNITURE,
		request:
			"A glass table for where we cook and eat, I'll put it together myself",
		expected: { material: "glass", room: "kitchen", assembly: false },
	},

	// --- pets -----------------------------------------------------------------
	{
		id: "pets-old-labrador",
		domain: "pets",
		tool: PETS,
		request: "Food for my 12-year-old labrador, he's allergic to wheat",
		expected: { animal: "dog", life_stage: "senior", grain_free: true },
	},
	{
		id: "pets-new-kitten",
		domain: "pets",
		tool: PETS,
		request: "Something for the kitten we just brought home",
		expected: { animal: "cat", life_stage: "young", grain_free: null },
	},

	// --- software ---------------------------------------------------------------
	{
		id: "saas-yearly-team-trial",
		domain: "software",
		tool: SAAS,
		request: "We pay once a year for the whole team, but let us try it first",
		expected: { plan: "team", billing: "yearly", trial: true },
	},
	{
		id: "saas-free",
		domain: "software",
		tool: SAAS,
		request: "Just the version that costs nothing",
		expected: { plan: "free", billing: null, trial: null },
	},

	// --- concerts -----------------------------------------------------------------
	{
		id: "concert-best-money",
		domain: "concerts",
		tool: CONCERT,
		request: "The best experience money can buy, backstage access included",
		expected: { section: "vip", accessible: null, merch_bundle: null },
	},
	{
		id: "concert-crowd-no-shirt",
		domain: "concerts",
		tool: CONCERT,
		request: "I want to be in the crowd near the stage, skip the t-shirt",
		expected: { section: "standing", accessible: null, merch_bundle: false },
	},

	// --- groceries ----------------------------------------------------------------
	{
		id: "groceries-lactose-shelf",
		domain: "groceries",
		tool: GROCERIES,
		request: "Lactose-free yogurt, only what is on the shelf right now",
		expected: { dietary: "dairy-free", in_stock_only: true },
	},
	{
		id: "groceries-plain",
		domain: "groceries",
		tool: GROCERIES,
		request: "Bread",
		expected: { dietary: null, in_stock_only: null },
	},

	// --- travel -------------------------------------------------------------------
	{
		id: "stays-sand-cat",
		domain: "travel",
		tool: STAYS,
		request: "Somewhere near the sand and the waves, our cat travels with us",
		expected: { area: "beach", pets_allowed: true },
	},
	{
		id: "stays-early-flight",
		domain: "travel",
		tool: STAYS,
		request: "Close to the terminal, we have a 6am flight",
		expected: { area: "airport", pets_allowed: null },
	},

	// --- clothing -----------------------------------------------------------------
	{
		id: "clothing-baggy-xl",
		domain: "clothing",
		tool: CLOTHING,
		request: "Baggy jeans in extra large",
		expected: { size: "XL", fit: "relaxed", new_arrivals_only: null },
	},
	{
		id: "clothing-slim-latest",
		domain: "clothing",
		tool: CLOTHING,
		request: "A small slim shirt, anything from the latest collection",
		expected: { size: "S", fit: "slim", new_arrivals_only: true },
	},

	// --- electronics ---------------------------------------------------------------
	{
		id: "electronics-best-reviewed-new",
		domain: "electronics",
		tool: ELECTRONICS,
		request: "Headphones, best reviewed first, brand new only",
		expected: { sort: "rating", include_refurbished: false },
	},
	{
		id: "electronics-priciest",
		domain: "electronics",
		tool: ELECTRONICS,
		request: "Show the most expensive cameras first",
		expected: { sort: "price_high", include_refurbished: null },
	},
	{
		id: "electronics-plain",
		domain: "electronics",
		tool: ELECTRONICS,
		request: "Phones",
		expected: { sort: null, include_refurbished: null },
	},
];
