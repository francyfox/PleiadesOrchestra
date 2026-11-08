import { beforeAll, expect, test } from "bun:test";
import { TOOL_ERROR_CODES } from "../../../../core/src/goap/tool-error.ts";

// biome-ignore lint/suspicious/noExplicitAny: the core is a classic script that sets a global
let core: any;
beforeAll(async () => {
	await import("./tools-core.js");
	core = (globalThis as { PleiadesWpCore?: unknown }).PleiadesWpCore;
});

const env = { minorUnit: 2, woo: true };

test("search_products maps filters; prices go to minor units", () => {
	expect(
		core.buildRequest(
			"search_products",
			{
				query: "shirt",
				category: "7",
				min_price: 10,
				max_price: 25.5,
				on_sale: true,
				page: 2,
			},
			env,
		),
	).toEqual({
		api: "store",
		method: "GET",
		path: "products",
		query: {
			search: "shirt",
			category: "7",
			min_price: "1000",
			max_price: "2550",
			on_sale: "true",
			page: "2",
			per_page: "10",
		},
	});
});

test("cart writes carry a JSON body; variation object becomes the Store API list", () => {
	expect(
		core.buildRequest(
			"add_to_cart",
			{ id: 5, quantity: 2, variation: { Size: "Large" } },
			env,
		),
	).toMatchObject({
		method: "POST",
		path: "cart/add-item",
		body: {
			id: 5,
			quantity: 2,
			variation: [{ attribute: "Size", value: "Large" }],
		},
	});
	expect(
		core.buildRequest("remove_cart_item", { key: "abc" }, env).body,
	).toEqual({ key: "abc" });
	expect(
		core.buildRequest("update_cart_item", { key: "abc", quantity: 3 }, env)
			.body,
	).toEqual({ key: "abc", quantity: 3 });
});

test("unknown tool and missing arguments throw", () => {
	expect(() => core.buildRequest("nope", {}, env)).toThrow();
	expect(() => core.buildRequest("get_product", {}, env)).toThrow();
});

test("nonce is refreshed from the response, kept otherwise", () => {
	expect(core.nextNonce("old", new Headers({ Nonce: "new" }))).toBe("new");
	expect(core.nextNonce("old", new Headers())).toBe("old");
});

test("same-origin check", () => {
	const o = "https://shop.test";
	expect(core.sameOrigin("/cart/", o)).toBe("https://shop.test/cart/");
	expect(core.sameOrigin("https://shop.test/p?x=1", o)).toBe(
		"https://shop.test/p?x=1",
	);
	expect(core.sameOrigin("https://evil.test/", o)).toBeNull();
	expect(core.sameOrigin("javascript:alert(1)", o)).toBeNull();
	expect(core.sameOrigin("//evil.test/", o)).toBeNull();
});

test("endpoint URL works with plain permalinks (rest_route)", () => {
	expect(
		core.endpoint("https://s.test/?rest_route=/wc/store/v1/", "products", {
			search: "a",
		}),
	).toBe("https://s.test/?rest_route=%2Fwc%2Fstore%2Fv1%2Fproducts&search=a");
	expect(core.endpoint("https://s.test/wp-json/wc/store/v1/", "cart", {})).toBe(
		"https://s.test/wp-json/wc/store/v1/cart",
	);
});

test("get_product shows variation attributes as name + allowed values", () => {
	const out = core.shapeProduct(
		{
			id: 9,
			name: "Hoodie",
			type: "variable",
			permalink: "https://s.test/hoodie/",
			is_in_stock: true,
			short_description: "<p>Warm &amp; soft</p>",
			description: "<p>Long</p>",
			prices: { price: "4500", currency_code: "USD", currency_minor_unit: 2 },
			average_rating: "4.5",
			attributes: [
				{
					name: "Color",
					has_variations: true,
					terms: [{ name: "Blue" }, { name: "Red" }],
				},
				{
					name: "Material",
					has_variations: false,
					terms: [{ name: "Cotton" }],
				},
			],
			variations: [{ id: 10, attributes: [{ name: "Color", value: "blue" }] }],
		},
		true,
	);
	expect(out.price).toBe("45.00");
	expect(out.currency).toBe("USD");
	expect(out.variation_attributes).toEqual([
		{ name: "Color", values: ["Blue", "Red"] },
	]);
	expect(out.attributes).toEqual([{ name: "Material", values: ["Cotton"] }]);
	expect(out.description).toBe("Long");
	expect(out.summary).toBe("Warm & soft");
});

test("a variable product in a list says which attributes add_to_cart needs, a simple one does not", () => {
	const variable = core.shapeProduct({
		id: 9,
		name: "Hoodie",
		type: "variable",
		attributes: [
			{
				name: "Size",
				has_variations: true,
				terms: [{ name: "S" }, { name: "M" }],
			},
			{ name: "Material", has_variations: false, terms: [{ name: "Cotton" }] },
		],
	});
	expect(variable.variation_attributes).toEqual([
		{ name: "Size", values: ["S", "M"] },
	]);
	expect(
		core.shapeProduct({ id: 1, name: "Milk", type: "simple", attributes: [] }),
	).not.toHaveProperty("variation_attributes");
});

test("htmlToText strips tags and decodes entities", () => {
	expect(
		core.htmlToText("<h1>A</h1><p>b &amp; c&nbsp;d</p><script>x()</script>"),
	).toBe("A b & c d");
});

const recipe = {
	name: "Fruit Salad",
	servings: 2,
	items: [
		{ id: 1, name: "Apple", quantity: 2 },
		{ id: 2, name: "Kiwi", quantity: 3 },
	],
};

test("bundle tools exist only for the lists the page printed; the enum is the names", () => {
	expect(core.bundleTools({})).toEqual([]);
	const tools = core.bundleTools({
		recipes: [recipe],
		kits: [{ name: "Kit A" }],
	});
	expect(tools.map((t: { name: string }) => t.name)).toEqual([
		"list_recipes",
		"add_recipe_to_cart",
		"list_kits",
		"add_kit_to_cart",
	]);
	expect(tools[1].inputSchema.properties.recipe.enum).toEqual(["Fruit Salad"]);
	expect(tools[1].inputSchema.required).toEqual(["recipe"]);
	expect(tools[3].inputSchema.properties.kit.enum).toEqual(["Kit A"]);
});

test("findBundle ignores case and rejects unknown names", () => {
	expect(core.findBundle([recipe], "fruit salad")).toBe(recipe);
	expect(() => core.findBundle([recipe], "Soup")).toThrow("NOT_FOUND");
});

test("servings scale quantities up (rounded up) and never below 1", () => {
	expect(
		core
			.scaleItems(recipe, undefined)
			.map((i: { quantity: number }) => i.quantity),
	).toEqual([2, 3]);
	expect(
		core.scaleItems(recipe, 3).map((i: { quantity: number }) => i.quantity),
	).toEqual([3, 5]);
	expect(
		core.scaleItems(recipe, 1).map((i: { quantity: number }) => i.quantity),
	).toEqual([1, 2]);
	expect(core.scaleItems({ items: recipe.items }, 4)[0].quantity).toBe(2);
});

test("addAll keeps going after a failure and lists what could not be added", async () => {
	const out = await core.addAll(recipe.items, async (item: { id: number }) => {
		if (item.id === 2) throw core.toolError("OUT_OF_STOCK");
		return { items_count: 2 };
	});
	expect(out.added).toEqual([{ name: "Apple", quantity: 2 }]);
	expect(out.missing).toEqual([{ name: "Kiwi", reason: "OUT_OF_STOCK" }]);
	expect(out.cart).toEqual({ items_count: 2 });
	expect(core.summarize(out)).toBe(
		"Added 1 item. Could not add: Kiwi (out of stock).",
	);
});

test("list_recipes shape: names, servings, time, ingredient count", () => {
	expect(core.listBundles([{ ...recipe, time_minutes: 10, url: "u" }])).toEqual(
		[
			{
				name: "Fruit Salad",
				servings: 2,
				time_minutes: 10,
				ingredients: 2,
				url: "u",
			},
		],
	);
});

test("open_page tells the model to use it and lists the shop's page addresses", () => {
	const plain = core.TOOLS.find(
		(t: { name: string }) => t.name === "open_page",
	);
	expect(plain.description).toContain("instead of telling the visitor");
	expect(core.withPages(core.TOOLS, {})).toBe(core.TOOLS);
	const tools = core.withPages(core.TOOLS, {
		pages: {
			cart: "https://s.test/cart/",
			checkout: "",
			account: "https://s.test/my/",
		},
	});
	const open = tools.find((t: { name: string }) => t.name === "open_page");
	expect(open.description).toContain(
		"cart: https://s.test/cart/; account: https://s.test/my/",
	);
	expect(open.description).not.toContain("checkout:");
	expect(open.inputSchema.properties.url.description).toContain(
		"https://s.test/cart/",
	);
});

test("searchFallbacks: drop category, then one request per word", () => {
	expect(
		core.searchFallbacks({ query: "red wool scarf", category: "7" }),
	).toEqual([
		[{ query: "red wool scarf", category: undefined }],
		[
			{ query: "red", category: undefined },
			{ query: "wool", category: undefined },
			{ query: "scarf", category: undefined },
		],
	]);
	expect(core.searchFallbacks({ query: "scarf" })).toEqual([]);
});

test("searchPageUrl builds the shop results page", () => {
	expect(
		core.searchPageUrl("http://x.test", {
			query: "red shoe",
			category: "boots",
			min_price: 5,
			page: 2,
		}),
	).toBe(
		"http://x.test/?s=red+shoe&post_type=product&product_cat=boots&min_price=5&paged=2",
	);
	expect(core.searchPageUrl("http://x.test", { category: "7" }, "hats")).toBe(
		"http://x.test/?post_type=product&product_cat=hats",
	);
});

const hintOf = (fn: () => void) => {
	try {
		fn();
	} catch (e) {
		return (e as { code: string; hint: string }).code === "MISSING_ARGUMENT"
			? (e as { hint: string }).hint
			: undefined;
	}
};

test("add_to_cart without id says where to get one", () => {
	expect(hintOf(() => core.buildRequest("add_to_cart", {}, env))).toMatch(
		/search_products/,
	);
});

test("add_to_cart accepts product_id / productId as the id", () => {
	for (const args of [{ product_id: "5" }, { productId: 5 }])
		expect(core.buildRequest("add_to_cart", args, env).body.id).toBe(5);
});

test("cart item tools say where the key comes from", () => {
	for (const name of ["update_cart_item", "remove_cart_item"])
		expect(hintOf(() => core.buildRequest(name, { quantity: 1 }))).toMatch(
			/key is required.*get_cart/,
		);
});

test("update_cart_item with quantity 0 removes the item", () => {
	const r = core.buildRequest("update_cart_item", { key: "k1", quantity: 0 });
	expect(r.path).toBe("cart/remove-item");
	expect(r.body).toEqual({ key: "k1" });
});

test("the plugin's codes are exactly core's closed list", () => {
	expect(core.ERROR_CODES).toEqual([...TOOL_ERROR_CODES]);
});

// Real answers of the Store API (apps/e2e/tests/wordpress/tools/*.spec.ts), keyed by their `code`.
test("a REST error becomes a code from its `code` field; the message is never read", () => {
	const shop = (code: string, status = 400) => ({
		code,
		message: 'You cannot add "Secret" to the cart',
		data: { status },
	});
	for (const [code, status, expected] of [
		["woocommerce_rest_cart_invalid_product", 400, "NOT_FOUND"],
		["woocommerce_rest_product_invalid_id", 404, "NOT_FOUND"],
		["woocommerce_rest_product_out_of_stock", 400, "OUT_OF_STOCK"],
		["woocommerce_rest_product_not_purchasable", 400, "NOT_PURCHASABLE"],
		["woocommerce_rest_missing_attributes", 400, "VARIATION_REQUIRED"],
		["woocommerce_rest_product_invalid_quantity", 400, "INVALID_QUANTITY"],
		["invalid_quantity", 400, "INVALID_QUANTITY"],
		["woocommerce_rest_cart_invalid_key", 409, "CART_ITEM_GONE"],
		["woocommerce_rest_invalid_nonce", 403, "NONCE_EXPIRED"],
		["woocommerce_rest_missing_nonce", 401, "NONCE_EXPIRED"],
		["something_new", 500, "UNKNOWN"],
		["something_new", 404, "NOT_FOUND"],
		["something_new", 403, "NOT_ALLOWED"],
	] as const)
		expect(core.codeFromResponse(shop(code, status), status)).toBe(expected);
	expect(core.codeFromResponse({}, 502)).toBe("UNKNOWN");
	expect(
		core.codeFromResponse(
			{ code: "rest_invalid_param", data: { params: { quantity: "x" } } },
			400,
		),
	).toBe("INVALID_QUANTITY");
	expect(
		core.codeFromResponse(
			{ code: "rest_invalid_param", data: { params: { id: "x" } } },
			400,
		),
	).toBe("MISSING_ARGUMENT");
});

test("an error result holds the code and our own safe fields, nothing else", () => {
	const missing = (() => {
		try {
			core.buildRequest("get_product", {}, env);
		} catch (e) {
			return e;
		}
	})();
	expect(core.errorPayload(missing)).toEqual({
		error_code: "MISSING_ARGUMENT",
		status: undefined,
		hint: expect.stringContaining("search_products"),
	});
	expect(
		core.errorPayload(core.toolError("OUT_OF_STOCK", { status: 400 })),
	).toEqual({ error_code: "OUT_OF_STOCK", status: 400, hint: undefined });
	// A fetch that got no answer; a foreign error; a DOMException's numeric `code`.
	expect(core.errorPayload(new TypeError("Failed to fetch")).error_code).toBe(
		"NETWORK",
	);
	expect(core.errorPayload(new Error("boom <b>raw</b>")).error_code).toBe(
		"UNKNOWN",
	);
	expect(
		core.errorPayload(Object.assign(new Error("x"), { code: 20 })).error_code,
	).toBe("UNKNOWN");
	expect(JSON.stringify(core.errorPayload(new Error("boom")))).not.toContain(
		"boom",
	);
});
