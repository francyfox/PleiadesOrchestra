// Pure helpers of the WebMCP tools (no DOM, no fetch): tested with `bun test`.
// A classic script (WordPress prints it as is), so it publishes a global.
(() => {
	// Every failure leaves a tool as one code of this closed list (the same as TOOL_ERROR_CODES in
	// packages/core/src/goap/tool-error.ts, a test keeps them equal), never as the shop's own message:
	// the orchestrator tells the visitor by the code. `hint` is OUR text for a calling model.
	const ERROR_CODES = [
		"MISSING_ARGUMENT",
		"NOT_FOUND",
		"NOT_PURCHASABLE",
		"OUT_OF_STOCK",
		"VARIATION_REQUIRED",
		"INVALID_QUANTITY",
		"CART_ITEM_GONE",
		"NOT_ALLOWED",
		"NETWORK",
		"NONCE_EXPIRED",
		"LIMIT_EXCEEDED",
		"UNKNOWN",
	];
	// Defaults of the per-call limits; PHP (Pleiades_Limits) is the source of truth and prints them as
	// cfg.limits, these only stand in when a page prints none (a cached older page).
	const LIMITS = {
		addQuantity: 20,
		cartQuantity: 99,
		servings: 12,
		callUnits: 100,
	};
	/** cfg.limits with every missing or non-positive value replaced by its default. */
	const limitsOf = (cfg) =>
		Object.fromEntries(
			Object.entries(LIMITS).map(([k, d]) => {
				const v = Number(cfg?.limits?.[k]);
				return [k, v >= 1 ? Math.floor(v) : d];
			}),
		);
	/** Refuses (never clamps) a number above `max`; `hint` is OUR text for the calling model. */
	const within = (value, max, what) => {
		if (Number(value) > max)
			throw toolError("LIMIT_EXCEEDED", {
				hint: `${what} is limited to ${max}; ask for ${max} or fewer`,
			});
	};
	// The `code` of WooCommerce / WordPress REST errors (read from real responses, see the e2e specs).
	const STORE_CODES = {
		woocommerce_rest_cart_invalid_product: "NOT_FOUND",
		woocommerce_rest_product_invalid_id: "NOT_FOUND",
		rest_post_invalid_id: "NOT_FOUND",
		woocommerce_rest_product_out_of_stock: "OUT_OF_STOCK",
		woocommerce_rest_product_partially_out_of_stock: "OUT_OF_STOCK",
		woocommerce_rest_product_not_purchasable: "NOT_PURCHASABLE",
		woocommerce_rest_missing_attributes: "VARIATION_REQUIRED",
		woocommerce_rest_missing_variation_data: "VARIATION_REQUIRED",
		woocommerce_rest_invalid_variation_data: "VARIATION_REQUIRED",
		woocommerce_rest_variation_id_from_variation_data: "VARIATION_REQUIRED",
		woocommerce_rest_product_invalid_quantity: "INVALID_QUANTITY",
		invalid_quantity: "INVALID_QUANTITY",
		woocommerce_rest_cart_invalid_key: "CART_ITEM_GONE",
		woocommerce_rest_missing_nonce: "NONCE_EXPIRED",
		woocommerce_rest_invalid_nonce: "NONCE_EXPIRED",
		rest_forbidden: "NOT_ALLOWED",
	};
	/** An Error that carries only a code (and our own safe fields), never a shop message. */
	const toolError = (code, extra = {}) =>
		Object.assign(new Error(code), { ...extra, code });
	/** The code of a failed REST response: by its `code` field, else by status. The message is never read. */
	function codeFromResponse(data, status) {
		const code = STORE_CODES[data?.code];
		if (code) return code;
		if (data?.code === "rest_invalid_param")
			return data.data?.params?.quantity
				? "INVALID_QUANTITY"
				: "MISSING_ARGUMENT";
		if (status === 404) return "NOT_FOUND";
		if (status === 401 || status === 403) return "NOT_ALLOWED";
		return "UNKNOWN";
	}
	/** The error result a tool returns: `{error_code, status?, hint?}`; a fetch that never got an answer is NETWORK. */
	function errorPayload(e) {
		const code = ERROR_CODES.includes(e?.code)
			? e.code
			: e instanceof TypeError
				? "NETWORK"
				: "UNKNOWN";
		return { error_code: code, status: e?.status, hint: e?.hint };
	}

	const need = (args, key, hint = "") => {
		if (args[key] === undefined || args[key] === "")
			throw toolError("MISSING_ARGUMENT", {
				argument: key,
				hint: hint || `missing argument: ${key}`,
			});
		return args[key];
	};
	const NEED_ID =
		"id is required: find it with search_products or get_current_product";
	const NEED_KEY = "key is required: take it from get_cart";
	const minor = (value, env) =>
		String(Math.round(Number(value) * 10 ** (env.minorUnit ?? 2)));

	/** Tool → request description. `env`: { minorUnit, post, limits } (post: get_page asks /posts). */
	function buildRequest(name, rawArgs, env = {}) {
		const limits = env.limits ?? LIMITS;
		// Callers name the id differently (the schema says `id`, models write product_id).
		const args = { id: rawArgs.product_id ?? rawArgs.productId, ...rawArgs };
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
					path: `products/${Number(need(args, "id", NEED_ID))}`,
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
				within(
					args.quantity ?? 1,
					limits.addQuantity,
					"quantity per add_to_cart call",
				);
				return {
					api: "store",
					method: "POST",
					path: "cart/add-item",
					query: {},
					body: {
						id: Number(need(args, "id", NEED_ID)),
						quantity: Number(args.quantity ?? 1),
						variation: Object.entries(args.variation ?? {}).map(
							([attribute, value]) => ({ attribute, value: String(value) }),
						),
					},
				};
			case "update_cart_item":
				// The Store API rejects quantity 0: that means "remove".
				if (Number(args.quantity) === 0)
					return buildRequest("remove_cart_item", args, env);
				within(args.quantity, limits.cartQuantity, "quantity of a cart item");
				return {
					api: "store",
					method: "POST",
					path: "cart/update-item",
					query: {},
					body: {
						key: need(args, "key", NEED_KEY),
						quantity: Number(need(args, "quantity")),
					},
				};
			case "remove_cart_item":
				return {
					api: "store",
					method: "POST",
					path: "cart/remove-item",
					query: {},
					body: { key: need(args, "key", NEED_KEY) },
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
				throw toolError("UNKNOWN");
		}
	}

	/**
	 * Store API `search` needs every word in one product, and `category` narrows to it: a long phrase
	 * or a wrong category returns nothing for a product the visitor can see. Retry looser, in order:
	 * without category, then each word alone (results merged by id).
	 */
	function searchFallbacks(args) {
		const out = [];
		const loose = { ...args, category: undefined };
		if (args.category) out.push([loose]);
		const words = [
			...new Set(
				String(args.query ?? "")
					.split(/\s+/)
					.filter((w) => w.length > 2),
			),
		];
		if (words.length > 1) out.push(words.map((query) => ({ ...loose, query })));
		return out;
	}

	/** The Store API sends a fresh nonce with each response. */
	const nextNonce = (current, headers) => headers.get("Nonce") || current;

	/** Absolute URL if `url` stays on `origin` (http/https), else null. */
	/**
	 * The shop's own results page for a search_products call (a classic site shows a page, not JSON).
	 * `slug`: the category slug when `args.category` is an id. shortcut: no on_sale (WooCommerce has no URL
	 * parameter for it), the price filter works only if the theme honours min_price/max_price.
	 */
	function searchPageUrl(origin, args, slug) {
		const u = new URL("/", origin);
		if (args.query) u.searchParams.set("s", String(args.query));
		u.searchParams.set("post_type", "product");
		const cat = slug ?? args.category;
		if (cat) u.searchParams.set("product_cat", String(cat));
		for (const k of ["min_price", "max_price"])
			if (args[k] !== undefined) u.searchParams.set(k, String(args[k]));
		if (args.page > 1) u.searchParams.set("paged", String(args.page));
		return u.href;
	}

	function sameOrigin(url, origin) {
		if (typeof url !== "string") return null;
		try {
			const u = new URL(url, origin);
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
		// A list already says what add_to_cart's `variation` needs, so one search is enough to add.
		if (!full && p.type === "variable") {
			out.variation_attributes = (p.attributes ?? [])
				.filter((a) => a.has_variations)
				.map((a) => ({
					name: a.name,
					values: (a.terms ?? []).map((t) => t.name),
				}));
		}
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
				"Search the shop's catalog by keywords, with optional category, price range and sale filter. Returns up to 10 products per page, with their ids, and opens the shop's results page in the visitor's browser (the page reloads). Prefer one or two keywords and no category unless asked; if nothing is found it retries with looser terms.",
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
				"Open a page of this site in the visitor's browser (product, cart, checkout, article). Same site only. Call it as the very last step: the page reloads. Use this instead of telling the visitor where to click or which page to open.",
			inputSchema: obj({ url: str("Address on this site") }, ["url"]),
		},
	];

	// Recipes and kits: named bundles of products, printed into the page by PHP (window.PleiadesWp).
	const findBundle = (list, name) => {
		const found = list?.find(
			(b) => b.name.toLowerCase() === String(name ?? "").toLowerCase(),
		);
		if (!found) throw toolError("NOT_FOUND");
		return found;
	};

	/** Item quantities for `servings` (the bundle's own when it has none); over the limits nothing is returned, the call is refused. */
	function scaleItems(bundle, servings, limits = LIMITS) {
		within(servings, limits.servings, "servings");
		const factor =
			bundle.servings && servings > 0 ? servings / bundle.servings : 1;
		const items = bundle.items.map((i) => ({
			...i,
			quantity: Math.max(1, Math.ceil(i.quantity * factor)),
		}));
		within(
			items.reduce((sum, i) => sum + i.quantity, 0),
			limits.callUnits,
			"total units added by one call",
		);
		return items;
	}

	/** Adds every item with `addOne(item)`; one failure (e.g. out of stock) does not stop the rest. */
	async function addAll(items, addOne) {
		const out = { added: [], missing: [], cart: undefined };
		for (const item of items) {
			try {
				out.cart = await addOne(item);
				out.added.push({ name: item.name, quantity: item.quantity });
			} catch (e) {
				out.missing.push({
					name: item.name,
					reason: errorPayload(e).error_code,
				});
			}
		}
		return out;
	}

	function summarize({ added, missing }) {
		const n = added.length;
		let text = `Added ${n} item${n === 1 ? "" : "s"}.`;
		if (missing.length)
			text += ` Could not add: ${missing.map((m) => `${m.name} (${m.reason.toLowerCase().replace(/_/g, " ")})`).join(", ")}.`;
		return text;
	}

	const listBundles = (list) =>
		list.map((b) => ({
			name: b.name,
			servings: b.servings,
			time_minutes: b.time_minutes,
			ingredients: b.items.length,
			url: b.url,
		}));

	/** list_/add_ tools of the recipes and kits the page printed; the enum is the name list. */
	function bundleTools(cfg) {
		const tools = [];
		for (const [key, label, list] of [
			["recipe", "recipe", cfg.recipes],
			["kit", "kit", cfg.kits],
		]) {
			if (!list?.length) continue;
			tools.push(
				{
					name: `list_${key}s`,
					annotations: READ,
					description: `The shop's ${label}s: name, ${key === "recipe" ? "servings, time, " : ""}number of products, link.`,
					inputSchema: obj(),
				},
				{
					name: `add_${key}_to_cart`,
					annotations: WRITE,
					description: `Add every product of a ${label} to the visitor's cart in one step${key === "recipe" ? ", scaled to the number of servings" : ""}. Reports what was added and what is missing or out of stock.`,
					inputSchema: obj(
						{
							[key]: {
								type: "string",
								enum: list.map((b) => b.name),
								description: `Name of the ${label}`,
							},
							...(key === "recipe"
								? {
										servings: num(
											"People to cook for, default as in the recipe",
										),
									}
								: {}),
						},
						[key],
					),
				},
			);
		}
		return tools;
	}

	/** open_page names the shop's cart, checkout and account addresses (cfg.pages, from PHP) so the model need not guess them. */
	function withPages(tools, cfg) {
		const known = Object.entries(cfg.pages ?? {}).filter(([, url]) => url);
		if (!known.length) return tools;
		const list = known.map(([name, url]) => `${name}: ${url}`).join("; ");
		return tools.map((t) =>
			t.name === "open_page"
				? {
						...t,
						description: `${t.description} Addresses: ${list}.`,
						inputSchema: obj(
							{
								url: str(`Address on this site, e.g. ${known[0][1]}`),
							},
							["url"],
						),
					}
				: t,
		);
	}

	globalThis.PleiadesWpCore = {
		ERROR_CODES,
		limitsOf,
		toolError,
		codeFromResponse,
		errorPayload,
		withPages,
		buildRequest,
		nextNonce,
		searchFallbacks,
		sameOrigin,
		searchPageUrl,
		endpoint,
		htmlToText,
		shapeProduct,
		shapeResult,
		TOOLS,
		bundleTools,
		findBundle,
		scaleItems,
		addAll,
		summarize,
		listBundles,
	};
})();
