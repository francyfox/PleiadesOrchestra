// Pure helpers of the WebMCP tools (no DOM, no fetch): tested with `bun test`.
// A classic script (WordPress prints it as is), so it publishes a global.
(() => {
	const need = (args, key) => {
		if (args[key] === undefined || args[key] === "")
			throw new Error(`missing argument: ${key}`);
		return args[key];
	};
	const minor = (value, env) =>
		String(Math.round(Number(value) * 10 ** (env.minorUnit ?? 2)));

	/** Tool → request description. `env`: { minorUnit, post } (post: get_page asks /posts). */
	function buildRequest(name, args, env = {}) {
		switch (name) {
			case "search_products": {
				const query = { per_page: "10" };
				if (args.query) query.search = String(args.query);
				if (args.category) query.category = String(args.category);
				if (args.min_price !== undefined)
					query.min_price = minor(args.min_price, env);
				if (args.max_price !== undefined)
					query.max_price = minor(args.max_price, env);
				if (args.on_sale) query.on_sale = "true";
				if (args.page) query.page = String(args.page);
				return { api: "store", method: "GET", path: "products", query };
			}
			case "get_product":
				return {
					api: "store",
					method: "GET",
					path: `products/${Number(need(args, "id"))}`,
					query: {},
				};
			case "list_categories":
				return {
					api: "store",
					method: "GET",
					path: "products/categories",
					query: { per_page: "100" },
				};
			case "get_cart":
				return { api: "store", method: "GET", path: "cart", query: {} };
			case "add_to_cart":
				return {
					api: "store",
					method: "POST",
					path: "cart/add-item",
					query: {},
					body: {
						id: Number(need(args, "id")),
						quantity: Number(args.quantity ?? 1),
						variation: Object.entries(args.variation ?? {}).map(
							([attribute, value]) => ({ attribute, value: String(value) }),
						),
					},
				};
			case "update_cart_item":
				return {
					api: "store",
					method: "POST",
					path: "cart/update-item",
					query: {},
					body: {
						key: need(args, "key"),
						quantity: Number(need(args, "quantity")),
					},
				};
			case "remove_cart_item":
				return {
					api: "store",
					method: "POST",
					path: "cart/remove-item",
					query: {},
					body: { key: need(args, "key") },
				};
			case "search_site":
				return {
					api: "wp",
					method: "GET",
					path: "search",
					query: {
						search: String(need(args, "query")),
						per_page: "10",
						_fields: "id,title,url,type,subtype",
					},
				};
			case "get_page":
				return {
					api: "wp",
					method: "GET",
					path: `${env.post ? "posts" : "pages"}/${Number(need(args, "id"))}`,
					query: { _fields: "id,title,link,content" },
				};
			default:
				throw new Error(`unknown tool: ${name}`);
		}
	}

	/** The Store API sends a fresh nonce with each response. */
	const nextNonce = (current, headers) => headers.get("Nonce") || current;

	/** Absolute URL if `url` stays on `origin` (http/https), else null. */
	function sameOrigin(url, origin) {
		try {
			const u = new URL(String(url), origin);
			return /^https?:$/.test(u.protocol) && u.origin === origin
				? u.href
				: null;
		} catch {
			return null;
		}
	}

	/** `base` is rest_url(): pretty (/wp-json/…/) or plain permalinks (?rest_route=/…/). */
	function endpoint(base, path, query) {
		const u = new URL(base);
		if (u.searchParams.has("rest_route"))
			u.searchParams.set("rest_route", u.searchParams.get("rest_route") + path);
		else u.pathname += path;
		for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
		return u.href;
	}

	const ENTITIES = {
		amp: "&",
		lt: "<",
		gt: ">",
		quot: '"',
		nbsp: " ",
		"#39": "'",
		"#8217": "’",
	};
	function htmlToText(html) {
		return String(html ?? "")
			.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
			.replace(/<[^>]+>/g, " ")
			.replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? m)
			.replace(/\s+/g, " ")
			.trim();
	}

	const price = (p, key = "price") => {
		const unit = p?.currency_minor_unit ?? 2;
		return p?.[key] ? (Number(p[key]) / 10 ** unit).toFixed(unit) : undefined;
	};

	function shapeProduct(p, full = false) {
		const out = {
			id: p.id,
			name: p.name,
			type: p.type,
			price: price(p.prices),
			regular_price: price(p.prices, "regular_price"),
			currency: p.prices?.currency_code,
			on_sale: p.on_sale,
			in_stock: p.is_in_stock,
			link: p.permalink,
		};
		if (!full) return out;
		const attrs = (p.attributes ?? []).map((a) => ({
			name: a.name,
			values: (a.terms ?? []).map((t) => t.name),
			varies: a.has_variations,
		}));
		return {
			...out,
			summary: htmlToText(p.short_description),
			description: htmlToText(p.description),
			rating: p.average_rating,
			// What add_to_cart's `variation` copies from: attribute name → one allowed value.
			variation_attributes: attrs
				.filter((a) => a.varies)
				.map(({ name, values }) => ({ name, values })),
			attributes: attrs
				.filter((a) => !a.varies)
				.map(({ name, values }) => ({ name, values })),
			variations: (p.variations ?? []).map((v) => ({
				id: v.id,
				attributes: v.attributes,
			})),
		};
	}

	function shapeCart(c) {
		return {
			count: c.items_count,
			items: (c.items ?? []).map((i) => ({
				key: i.key,
				id: i.id,
				name: i.name,
				quantity: i.quantity,
				price: price(i.prices),
				variation: i.variation,
			})),
			total: price(c.totals, "total_price"),
			currency: c.totals?.currency_code,
		};
	}

	function shapeResult(name, data) {
		switch (name) {
			case "search_products":
				return data.map((p) => shapeProduct(p));
			case "get_product":
				return shapeProduct(data, true);
			case "list_categories":
				return data.map((c) => ({
					id: c.id,
					name: c.name,
					slug: c.slug,
					count: c.count,
					parent: c.parent,
				}));
			case "get_cart":
			case "add_to_cart":
			case "update_cart_item":
			case "remove_cart_item":
				return shapeCart(data);
			case "search_site":
				return data.map((r) => ({
					id: r.id,
					title: r.title,
					url: r.url,
					type: r.subtype || r.type,
				}));
			case "get_page":
				return {
					id: data.id,
					title: htmlToText(data.title?.rendered),
					url: data.link,
					text: htmlToText(data.content?.rendered),
				};
			default:
				return data;
		}
	}

	const str = (description) => ({ type: "string", description });
	const num = (description) => ({ type: "number", description });
	const obj = (properties = {}, required = []) => ({
		type: "object",
		properties,
		required,
	});
	const READ = { readOnlyHint: true };
	const WRITE = { readOnlyHint: false };

	// Descriptions are generic on purpose: any shop domain, not one catalog.
	const TOOLS = [
		{
			name: "get_current_product",
			woo: true,
			annotations: READ,
			description:
				"The product on the page the visitor is looking at now (id, name, price). Empty when the page is not a product.",
			inputSchema: obj(),
		},
		{
			name: "search_products",
			woo: true,
			annotations: READ,
			description:
				"Search the shop's catalog by keywords, with optional category, price range and sale filter. Returns up to 10 products per page.",
			inputSchema: obj({
				query: str("Keywords"),
				category: str("Category id or slug from list_categories"),
				min_price: num("Minimum price in the shop currency"),
				max_price: num("Maximum price in the shop currency"),
				on_sale: { type: "boolean", description: "Only discounted products" },
				page: num("Page number, from 1"),
			}),
		},
		{
			name: "get_product",
			woo: true,
			annotations: READ,
			description:
				"Full card of one product: description, attributes, variation options (attribute name and allowed values), stock, price, rating, link.",
			inputSchema: obj({ id: num("Product id") }, ["id"]),
		},
		{
			name: "list_categories",
			woo: true,
			annotations: READ,
			description: "All product categories of the shop.",
			inputSchema: obj(),
		},
		{
			name: "get_cart",
			woo: true,
			annotations: READ,
			description:
				"The visitor's current cart: items with their keys, quantities, total.",
			inputSchema: obj(),
		},
		{
			name: "add_to_cart",
			woo: true,
			annotations: WRITE,
			description:
				"Add a product to the visitor's cart. For a product with variations pass `variation`: each variation attribute name from get_product with one of its allowed values.",
			inputSchema: obj(
				{
					id: num("Product id"),
					quantity: num("How many, default 1"),
					variation: {
						type: "object",
						description: 'Attribute name to chosen value, e.g. {"Size": "M"}',
						additionalProperties: { type: "string" },
					},
				},
				["id"],
			),
		},
		{
			name: "update_cart_item",
			woo: true,
			annotations: WRITE,
			description:
				"Change the quantity of a cart item (use the key from get_cart).",
			inputSchema: obj(
				{ key: str("Cart item key"), quantity: num("New quantity") },
				["key", "quantity"],
			),
		},
		{
			name: "remove_cart_item",
			woo: true,
			annotations: WRITE,
			description: "Remove an item from the cart (use the key from get_cart).",
			inputSchema: obj({ key: str("Cart item key") }, ["key"]),
		},
		{
			name: "search_site",
			woo: false,
			annotations: READ,
			description:
				"Search the site's pages and posts by keywords (policies, delivery, FAQ, articles).",
			inputSchema: obj({ query: str("Keywords") }, ["query"]),
		},
		{
			name: "get_page",
			woo: false,
			annotations: READ,
			description:
				"Read a page or post of the site as plain text, by id from search_site.",
			inputSchema: obj({ id: num("Page or post id") }, ["id"]),
		},
		{
			name: "open_page",
			woo: false,
			annotations: WRITE,
			description:
				"Open a page of this site in the visitor's browser (product, cart, checkout, article). Same site only. Call it as the very last step: the page reloads.",
			inputSchema: obj({ url: str("Address on this site") }, ["url"]),
		},
	];

	globalThis.PleiadesWpCore = {
		buildRequest,
		nextNonce,
		sameOrigin,
		endpoint,
		htmlToText,
		shapeProduct,
		shapeResult,
		TOOLS,
	};
})();
