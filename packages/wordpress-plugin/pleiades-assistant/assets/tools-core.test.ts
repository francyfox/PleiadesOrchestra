import { beforeAll, expect, test } from "bun:test";

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

test("htmlToText strips tags and decodes entities", () => {
	expect(
		core.htmlToText("<h1>A</h1><p>b &amp; c&nbsp;d</p><script>x()</script>"),
	).toBe("A b & c d");
});
