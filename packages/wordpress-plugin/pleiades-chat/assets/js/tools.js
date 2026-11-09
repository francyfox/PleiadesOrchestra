// Registers the shop tools with WebMCP. Config comes from the plugin: window.PleiadesWp.
(() => {
	const cfg = window.PleiadesWp;
	const core = window.PleiadesWpCore;
	if (!cfg || !core) return;
	const limits = core.limitsOf(cfg);
	let nonce = cfg.nonce;
	let registered = false;

	const reply = (value) => ({
		content: [{ type: "text", text: JSON.stringify(value) }],
	});

	async function send(url, req, headers) {
		const res = await fetch(url, {
			method: req.method,
			credentials: "same-origin",
			headers,
			body: req.body && JSON.stringify(req.body),
		});
		nonce = core.nextNonce(nonce, res.headers);
		return res;
	}

	async function call(name, args, env = {}) {
		const req = core.buildRequest(name, args, {
			minorUnit: cfg.minorUnit,
			limits,
			...env,
		});
		const url = core.endpoint(
			req.api === "store" ? cfg.storeUrl : cfg.wpUrl,
			req.path,
			req.query,
		);
		const headers = { Accept: "application/json" };
		if (req.body) headers["Content-Type"] = "application/json";
		if (req.api === "store" && req.method !== "GET") headers.Nonce = nonce;
		let res = await send(url, req, headers);
		if (res.status === 403 && req.method !== "GET") {
			// A cached page printed a stale nonce: any Store API response carries a fresh one.
			await fetch(core.endpoint(cfg.storeUrl, "cart", {}), {
				credentials: "same-origin",
			}).then((r) => {
				nonce = core.nextNonce(nonce, r.headers);
			});
			headers.Nonce = nonce;
			res = await send(url, req, headers);
		}
		const data = await res.json().catch(() => ({}));
		if (!res.ok)
			throw core.toolError(core.codeFromResponse(data, res.status), {
				status: res.status,
			});
		return data;
	}

	/**
	 * Show a cart write without a reload. Classic themes: fragments (mini cart), the cart page's own
	 * markup (re-fetched, as WooCommerce's cart.js does after its Update button) and update_checkout.
	 * Block themes: the wc/store/cart data store.
	 */
	const CART_PAGE =
		".woocommerce:has(.woocommerce-cart-form), .woocommerce:has(.cart-empty)";
	async function refreshCart() {
		const $ = window.jQuery;
		$?.(document.body).trigger("wc_fragment_refresh");
		$?.(document.body).trigger("update_checkout");
		const cart = document.querySelector(CART_PAGE);
		if (cart) {
			const html = await (
				await fetch(location.href, { credentials: "same-origin" })
			).text();
			const fresh = new DOMParser()
				.parseFromString(html, "text/html")
				.querySelector(CART_PAGE);
			if (fresh) cart.replaceWith(fresh);
			$?.(document.body).trigger("updated_wc_div");
		}
		// Block mini cart and Cart/Checkout blocks listen for these (the data store itself is not on the page until they load).
		for (const type of [
			"wc-blocks_added_to_cart",
			"wc-blocks_removed_from_cart",
		])
			document.body.dispatchEvent(
				new CustomEvent(type, {
					bubbles: true,
					detail: { preserveCartData: false },
				}),
			);
		window.wp?.data
			?.dispatch?.("wc/store/cart")
			?.invalidateResolutionForStore?.();
	}

	// The reload kills this page and the server's next step goes to it, so during a widget turn navigate when
	// it has ended (events `pleiades:turn-start/-end`; the timer is the way out). Outside a turn: at once. Last call wins.
	let target;
	let inTurn = false;
	let fallback;
	function navigateSoon(href) {
		try {
			sessionStorage.setItem("pleiades-wp-open", "1");
		} catch {}
		target = href;
		clearTimeout(fallback);
		if (inTurn) fallback = setTimeout(go, 60000);
		else go();
	}
	function go() {
		clearTimeout(fallback);
		const href = target;
		target = undefined;
		if (href) setTimeout(() => location.assign(href), 50);
	}
	document.addEventListener("pleiades:turn-start", () => {
		inTurn = true;
	});
	document.addEventListener("pleiades:turn-end", () => {
		inTurn = false;
		go();
	});

	const run = {
		get_current_product: async () =>
			cfg.product ?? { note: "not a product page" },
		open_page: async ({ url }) => {
			const href = core.sameOrigin(url, location.origin);
			if (!href) throw core.toolError("NOT_ALLOWED");
			navigateSoon(href);
			return { opening: href, note: "navigating now" };
		},
		get_page: async (args) => {
			try {
				return core.shapeResult("get_page", await call("get_page", args));
			} catch (e) {
				if (e.status !== 404) throw e;
				return core.shapeResult(
					"get_page",
					await call("get_page", args, { post: true }),
				);
			}
		},
	};

	// Strict search first; on no hits try the looser variants (see searchFallbacks), merged by id.
	// With hits the visitor's page moves to the shop's results page (after the result is returned).
	run.search_products = async (args) => {
		let found = await call("search_products", args);
		let shown = args;
		for (const variants of found.length ? [] : core.searchFallbacks(args)) {
			const seen = new Map();
			const each = await Promise.all(
				variants.map((a) => call("search_products", a)),
			);
			for (const r of each) for (const p of r) seen.set(p.id, p);
			found = [...seen.values()];
			shown = variants[each.findIndex((r) => r.length)] ?? args;
			if (found.length) break;
		}
		if (found.length) {
			// The shop page filters by slug; the tool takes an id or a slug.
			let slug;
			if (/^\d+$/.test(String(shown.category ?? "")))
				slug = (await call("list_categories", {}).catch(() => [])).find(
					(c) => String(c.id) === String(shown.category),
				)?.slug;
			const href = core.searchPageUrl(location.origin, shown, slug);
			if (href !== location.href) navigateSoon(href);
		}
		return core.shapeResult("search_products", found);
	};

	const addItem = (i) =>
		call("add_to_cart", { id: i.id, quantity: i.quantity });
	const addBundle = (list, key) => async (args) => {
		const bundle = core.findBundle(list, args[key]);
		const out = await core.addAll(
			core.scaleItems(bundle, args.servings, limits),
			addItem,
		);
		const cart = out.cart && core.shapeResult("add_to_cart", out.cart);
		return {
			[key]: bundle.name,
			message: core.summarize(out),
			added: out.added,
			missing: out.missing,
			cart_count: cart?.count,
			cart_total: cart?.total,
			currency: cart?.currency,
		};
	};
	Object.assign(run, {
		list_recipes: async () => core.listBundles(cfg.recipes),
		list_kits: async () => core.listBundles(cfg.kits),
		add_recipe_to_cart: addBundle(cfg.recipes, "recipe"),
		add_kit_to_cart: addBundle(cfg.kits, "kit"),
	});

	function register() {
		if (registered || !document.modelContext || !cfg.tools) return;
		registered = true;
		const tools = core.withPages(
			cfg.woo ? [...core.TOOLS, ...core.bundleTools(cfg)] : core.TOOLS,
			cfg,
		);
		for (const tool of tools) {
			if (tool.woo && !cfg.woo) continue;
			const { woo, ...def } = tool;
			document.modelContext.registerTool({
				...def,
				execute: async (args) => {
					try {
						const data = await (
							run[tool.name] ??
							(async (a) =>
								core.shapeResult(tool.name, await call(tool.name, a)))
						)(args ?? {});
						if (!tool.annotations.readOnlyHint && tool.name !== "open_page")
							await refreshCart().catch(() => {});
						return reply(data);
					} catch (e) {
						// Chrome's WebMCP replaces a thrown error with a generic "invocation failed": return the code as a result.
						return { ...reply(core.errorPayload(e)), isError: true };
					}
				},
			});
		}
	}

	// "Add all" buttons printed next to a recipe's or kit's product list: hidden until this script runs.
	for (const b of document.querySelectorAll(".pleiades-add-all"))
		b.hidden = false;
	document.addEventListener("click", async (e) => {
		const button = e.target.closest?.(".pleiades-add-all");
		if (!button) return;
		button.disabled = true;
		const status = button.nextElementSibling;
		try {
			const out = await core.addAll(JSON.parse(button.dataset.items), addItem);
			status.textContent = core.summarize(out);
			await refreshCart().catch(() => {});
		} finally {
			button.disabled = false;
		}
	});

	// Native WebMCP exists at once; otherwise the widget installs its polyfill at mount and says so.
	register();
	document.addEventListener("pleiades:webmcp-ready", register);

	try {
		if (sessionStorage.getItem("pleiades-wp-open")) {
			sessionStorage.removeItem("pleiades-wp-open");
			const el = document.querySelector("pleiades-chat");
			if (el) el.open = true;
		}
	} catch {}
})();
