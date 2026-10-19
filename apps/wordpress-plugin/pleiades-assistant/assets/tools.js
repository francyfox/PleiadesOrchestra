// Registers the shop tools with WebMCP. Config comes from the plugin: window.PleiadesWp.
(() => {
	const cfg = window.PleiadesWp;
	const core = window.PleiadesWpCore;
	if (!cfg || !core) return;
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
			throw Object.assign(new Error(data.message || `HTTP ${res.status}`), {
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

	const run = {
		get_current_product: async () =>
			cfg.product ?? { note: "not a product page" },
		open_page: async ({ url }) => {
			const href = core.sameOrigin(url, location.origin);
			if (!href) throw new Error("only pages of this site can be opened");
			// The reload kills this page: leave the panel open next time, navigate after the result is returned.
			try {
				sessionStorage.setItem("pleiades-wp-open", "1");
			} catch {}
			setTimeout(() => location.assign(href), 50);
			return { opening: href };
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

	function register() {
		if (registered || !document.modelContext) return;
		registered = true;
		for (const tool of core.TOOLS) {
			if (tool.woo && !cfg.woo) continue;
			const { woo, ...def } = tool;
			document.modelContext.registerTool({
				...def,
				execute: async (args) => {
					const data = await (
						run[tool.name] ??
						(async (a) => core.shapeResult(tool.name, await call(tool.name, a)))
					)(args ?? {});
					if (!tool.annotations.readOnlyHint && tool.name !== "open_page")
						await refreshCart().catch(() => {});
					return reply(data);
				},
			});
		}
	}

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
