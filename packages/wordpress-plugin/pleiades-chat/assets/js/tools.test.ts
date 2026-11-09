import { beforeAll, expect, test } from "bun:test";

// Wiring of tools.js with fake browser globals: registered tools, navigation after the result.
type Tool = {
	name: string;
	execute(a: object): Promise<{ content: { text: string }[] }>;
};
const tools: Record<string, Tool> = {};
const assigned: string[] = [];
const events: Record<string, () => void> = {};
// noUncheckedIndexedAccess: a missing tool or event is a test bug, fail loudly.
const tool = (name: string): Tool => tools[name] as Tool;
const fire = (type: string) => (events[type] as () => void)();
const store = new Map<string, string>();
const fetched: string[] = [];
const product = {
	id: 7,
	name: "Lamp",
	permalink: "http://shop.test/p/lamp/",
	prices: {},
	images: [],
};

beforeAll(async () => {
	const g = globalThis as Record<string, unknown>;
	g.window = g;
	g.location = {
		origin: "http://shop.test",
		href: "http://shop.test/",
		assign: (h: string) => assigned.push(h),
	};
	g.sessionStorage = {
		setItem: (k: string, v: string) => store.set(k, v),
		getItem: (k: string) => store.get(k) ?? null,
		removeItem: (k: string) => store.delete(k),
	};
	g.document = {
		modelContext: {
			registerTool: (t: Tool) => {
				tools[t.name] = t;
			},
		},
		querySelectorAll: () => [],
		querySelector: () => null,
		addEventListener: (type: string, fn: () => void) => {
			events[type] = fn;
		},
		body: {},
	};
	g.fetch = async (url: string, init?: { body?: string }) => {
		fetched.push(url);
		if (/products\/404/.test(url))
			return new Response(
				JSON.stringify({
					code: "woocommerce_rest_product_invalid_id",
					message: "Raw <b>shop</b> text",
					data: { status: 404 },
				}),
				{ status: 404 },
			);
		if (/products\/500/.test(url)) throw new TypeError("Failed to fetch");
		// A shop that stores «Women’s» with the typographic apostrophe: only that spelling matches.
		if (/search=Women(%27|')s/.test(url)) return new Response("[]");
		if (/search=Women%E2%80%99s/.test(url))
			return new Response(JSON.stringify([{ ...product, id: 88 }]));
		// Word by word: «Black» matches many, «Gown» one.
		if (/search=Black\b/.test(url) && !/Gown|Women/.test(url))
			return new Response(
				JSON.stringify([{ ...product, id: 1, name: "Black Cup" }]),
			);
		if (/search=Gown/.test(url))
			return new Response(
				JSON.stringify([{ ...product, id: 88, name: "Black Women’s Gown" }]),
			);
		if (/search=Black%20Women%27s%20Gown|search=Black\+Women/.test(url))
			return new Response("[]");
		// The shop takes only its own spelling: Size / M.
		if (
			/cart\/add-item/.test(url) &&
			/"attribute":"Size","value":"M"/.test(init?.body ?? "")
		)
			return new Response(JSON.stringify({ items_count: 1, items: [] }));
		if (/cart\/add-item/.test(url))
			return new Response(
				JSON.stringify({ code: "woocommerce_rest_missing_attributes" }),
				{ status: 400 },
			);
		if (/products\/9\b/.test(url))
			return new Response(
				JSON.stringify({
					id: 9,
					type: "variable",
					attributes: [
						{
							name: "Size",
							has_variations: true,
							terms: [{ name: "S" }, { name: "M" }],
						},
					],
				}),
			);
		return new Response(
			JSON.stringify(/category=nope|search=zzz/.test(url) ? [] : [product]),
			{ headers: { "content-type": "application/json" } },
		);
	};
	g.PleiadesWp = {
		woo: true,
		tools: true,
		wpUrl: "http://shop.test/wp-json/wp/v2/",
		storeUrl: "http://shop.test/wp-json/wc/store/v1/",
		nonce: "n",
		minorUnit: 2,
	};
	await import("./tools-core.js");
	await import("./tools.js");
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("search_products returns first, then goes to the shop results page", async () => {
	assigned.length = 0;
	const out = await tool("search_products").execute({
		query: "lamp",
		max_price: 50,
	});
	expect(JSON.parse(out.content[0]?.text ?? "")[0].id).toBe(7);
	expect(assigned).toEqual([]);
	await wait(120);
	expect(assigned).toEqual([
		"http://shop.test/?s=lamp&post_type=product&max_price=50",
	]);
	expect(store.get("pleiades-wp-open")).toBe("1");
});

test("search_products with a wrong category falls back and shows the looser page", async () => {
	assigned.length = 0;
	const out = await tool("search_products").execute({
		query: "lamp",
		category: "nope",
	});
	expect(JSON.parse(out.content[0]?.text ?? "")[0].id).toBe(7);
	await wait(120);
	expect(assigned).toEqual(["http://shop.test/?s=lamp&post_type=product"]);
});

test("search_products with no hits stays on the page", async () => {
	assigned.length = 0;
	await tool("search_products").execute({ query: "zzz" });
	await wait(120);
	expect(assigned).toEqual([]);
});

test("add_to_cart without id returns the reason as an error result", async () => {
	const out = (await tool("add_to_cart").execute({})) as {
		isError?: boolean;
		content: { text: string }[];
	};
	expect(out.isError).toBe(true);
	const payload = JSON.parse(out.content[0]?.text ?? "");
	expect(payload.error_code).toBe("MISSING_ARGUMENT");
	expect(payload.hint).toMatch(/id is required.*search_products/);
});

test("a failed call returns only its code: the shop's text never leaves", async () => {
	const result = async (name: string, args: object) => {
		const out = (await tool(name).execute(args)) as {
			isError?: boolean;
			content: { text: string }[];
		};
		expect(out.isError).toBe(true);
		return out.content[0]?.text ?? "";
	};
	expect(await result("get_product", { id: 404 })).toBe(
		'{"error_code":"NOT_FOUND","status":404}',
	);
	expect(await result("get_product", { id: 500 })).toBe(
		'{"error_code":"NETWORK"}',
	);
	expect(await result("open_page", { url: "https://example.com/" })).toBe(
		'{"error_code":"NOT_ALLOWED"}',
	);
});

test("during a widget turn the navigation waits for the turn to end", async () => {
	assigned.length = 0;
	fire("pleiades:turn-start");
	await tool("search_products").execute({ query: "lamp" });
	await wait(120);
	expect(assigned).toEqual([]);
	fire("pleiades:turn-end");
	await wait(120);
	expect(assigned).toEqual(["http://shop.test/?s=lamp&post_type=product"]);
});

test("add_to_cart on a product that needs a variation says which options exist", async () => {
	const out = await tool("add_to_cart").execute({ id: 9 });
	expect(JSON.parse(out.content[0]?.text ?? "")).toEqual({
		error_code: "VARIATION_REQUIRED",
		status: 400,
		options: { Size: ["S", "M"] },
	});
});

test("a straight apostrophe still finds the product, and the page shows that search", async () => {
	assigned.length = 0;
	const out = await tool("search_products").execute({ query: "Women's" });
	expect(JSON.parse(out.content[0]?.text ?? "")[0].id).toBe(88);
	await wait(120);
	expect(assigned).toEqual([
		"http://shop.test/?s=Women%E2%80%99s&post_type=product",
	]);
});

test("a search that only worked word by word ranks the best match first and does not move the visitor", async () => {
	assigned.length = 0;
	const out = await tool("search_products").execute({
		query: "Black Women's Gown",
	});
	const ids = JSON.parse(out.content[0]?.text ?? "").map(
		(p: { id: number }) => p.id,
	);
	expect(ids[0]).toBe(88);
	await wait(120);
	expect(assigned).toEqual([]);
});

test("a variation in the wrong case is matched to the product's own spelling and added", async () => {
	const out = await tool("add_to_cart").execute({
		id: 9,
		variation: { size: "m" },
	});
	expect(JSON.parse(out.content[0]?.text ?? "").count).toBe(1);
});
