import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { installWebMcpPolyfill } from "./install.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type FakeIframe = { getAttribute: (attr: string) => string | null };

function makeDocument(iframes: FakeIframe[] = []): Record<string, unknown> {
	return {
		// "loading" prevents installWebMcpPolyfill() from calling polyfillCSSPseudoClasses immediately.
		readyState: "loading",
		addEventListener: () => {},
		removeEventListener: () => {},
		documentElement: { nodeType: 1 },
		styleSheets: [],
		querySelectorAll: (sel: string) => {
			if (sel === "form[toolname]") return [];
			if (sel === "style") return [];
			if (sel === "iframe")
				return iframes.map((f) => ({ ...f, contentWindow: null }));
			if (sel === 'iframe[allow~="tools"]')
				return iframes.filter((f) => f.getAttribute("allow") === "tools");
			return [];
		},
	};
}

function setupEnv(iframes: FakeIframe[] = []) {
	(globalThis as Record<string, unknown>).document = makeDocument(iframes);
	// Reset tools map so polyfill re-initializes it.
	(globalThis as Record<string, unknown>).__webmcp_registered_tools = undefined;
	// Stub MutationObserver (not available in bun:test runtime).
	(globalThis as Record<string, unknown>).MutationObserver = class {
		observe() {}
		disconnect() {}
	};
	// Provide location for `new URL(src, location.href)` inside getTools().
	(globalThis as Record<string, unknown>).location = {
		href: "http://localhost/",
	};
}

afterEach(() => {
	(globalThis as Record<string, unknown>).document = undefined;
	(globalThis as Record<string, unknown>).__webmcp_registered_tools = undefined;
	(globalThis as Record<string, unknown>).MutationObserver = undefined;
	(globalThis as Record<string, unknown>).location = undefined;
});

// ─────────────────────────────────────────────────────────────────────────────
// Install
// ─────────────────────────────────────────────────────────────────────────────

describe("installWebMcpPolyfill", () => {
	test("sets document.modelContext", () => {
		setupEnv();
		expect(
			(document as unknown as Record<string, unknown>).modelContext,
		).toBeUndefined();
		installWebMcpPolyfill();
		expect(
			(document as unknown as Record<string, unknown>).modelContext,
		).toBeDefined();
	});

	test("is idempotent — second call returns the same object", () => {
		setupEnv();
		installWebMcpPolyfill();
		const first = (document as unknown as Record<string, unknown>).modelContext;
		installWebMcpPolyfill();
		const second = (document as unknown as Record<string, unknown>)
			.modelContext;
		expect(first).toBe(second);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// registerTool
// ─────────────────────────────────────────────────────────────────────────────

describe("registerTool", () => {
	beforeEach(() => {
		setupEnv();
		installWebMcpPolyfill();
	});

	test("throws InvalidStateError for names with illegal characters", async () => {
		const mc = (
			document as unknown as {
				modelContext: { registerTool: (t: unknown) => Promise<void> };
			}
		).modelContext;
		let err: unknown;
		try {
			await mc.registerTool({ name: "bad name!", description: "x" });
		} catch (e) {
			err = e;
		}
		expect(err).toMatchObject({ name: "InvalidStateError" });
	});

	test("throws when name is missing", async () => {
		const mc = (
			document as unknown as {
				modelContext: { registerTool: (t: unknown) => Promise<void> };
			}
		).modelContext;
		let err: unknown;
		try {
			await mc.registerTool({ description: "x" });
		} catch (e) {
			err = e;
		}
		expect(err).toBeDefined();
	});

	test("dispatches toolchange after successful registration", async () => {
		const mc = (
			document as unknown as {
				modelContext: EventTarget & {
					registerTool: (t: unknown) => Promise<void>;
				};
			}
		).modelContext;
		let fired = 0;
		mc.addEventListener("toolchange", () => {
			fired++;
		});
		await mc.registerTool({ name: "my_tool", description: "does things" });
		expect(fired).toBe(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// getTools — origin filtering
// ─────────────────────────────────────────────────────────────────────────────

describe("getTools — origin filtering", () => {
	beforeEach(() => {
		setupEnv();
		installWebMcpPolyfill();
	});

	test("returns a same-origin registered tool", async () => {
		const mc = (
			document as unknown as {
				modelContext: {
					registerTool: (t: unknown) => Promise<void>;
					getTools: () => Promise<{ name: string }[]>;
				};
			}
		).modelContext;
		await mc.registerTool({ name: "local_tool", description: "local" });
		const tools = await mc.getTools();
		expect(tools.map((t) => t.name)).toContain("local_tool");
	});

	test("excludes a cross-origin tool when no allow='tools' iframe is present", async () => {
		// Inject a tool with a foreign origin directly (simulates what getRemoteTools returns).
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).__webmcp_registered_tools?.set("remote_tool", {
			name: "remote_tool",
			description: "remote",
			origin: "https://demo.example.com",
			window: globalThis,
			inputSchema: undefined,
			_execute: () => {},
		});

		const mc = (
			document as unknown as {
				modelContext: { getTools: () => Promise<{ name: string }[]> };
			}
		).modelContext;
		const tools = await mc.getTools();
		expect(tools.map((t) => t.name)).not.toContain("remote_tool");
	});

	test("includes a cross-origin tool when fromOrigins is specified explicitly", async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).__webmcp_registered_tools?.set("remote_tool", {
			name: "remote_tool",
			description: "remote",
			origin: "https://demo.example.com",
			window: globalThis,
			inputSchema: undefined,
			_execute: () => {},
		});

		const mc = (
			document as unknown as {
				modelContext: {
					getTools: (o: {
						fromOrigins: string[];
					}) => Promise<{ name: string }[]>;
				};
			}
		).modelContext;
		const tools = await mc.getTools({
			fromOrigins: ["https://demo.example.com"],
		});
		expect(tools.map((t) => t.name)).toContain("remote_tool");
	});

	test("trusts cross-origin tool when a matching allow='tools' iframe is in the DOM", async () => {
		// Re-install with a fake iframe in the DOM.
		(globalThis as Record<string, unknown>).document = undefined;
		(globalThis as Record<string, unknown>).__webmcp_registered_tools =
			undefined;
		setupEnv([
			{
				getAttribute: (a: string) =>
					a === "src"
						? "https://demo.example.com/app"
						: a === "allow"
							? "tools"
							: null,
			},
		]);
		installWebMcpPolyfill();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).__webmcp_registered_tools?.set("remote_tool", {
			name: "remote_tool",
			description: "remote",
			origin: "https://demo.example.com",
			window: globalThis,
			inputSchema: undefined,
			_execute: () => {},
		});

		const mc = (
			document as unknown as {
				modelContext: { getTools: () => Promise<{ name: string }[]> };
			}
		).modelContext;
		const tools = await mc.getTools();
		expect(tools.map((t) => t.name)).toContain("remote_tool");
	});

	test("does NOT trust cross-origin tool when iframe lacks allow='tools'", async () => {
		(globalThis as Record<string, unknown>).document = undefined;
		(globalThis as Record<string, unknown>).__webmcp_registered_tools =
			undefined;
		setupEnv([
			{
				// iframe without allow="tools" attribute
				getAttribute: (a: string) =>
					a === "src" ? "https://demo.example.com/app" : null,
			},
		]);
		installWebMcpPolyfill();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).__webmcp_registered_tools?.set("remote_tool", {
			name: "remote_tool",
			description: "remote",
			origin: "https://demo.example.com",
			window: globalThis,
			inputSchema: undefined,
			_execute: () => {},
		});

		const mc = (
			document as unknown as {
				modelContext: { getTools: () => Promise<{ name: string }[]> };
			}
		).modelContext;
		const tools = await mc.getTools();
		expect(tools.map((t) => t.name)).not.toContain("remote_tool");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-window message bridge — origin checks
// ─────────────────────────────────────────────────────────────────────────────

type Posted = { msg: Record<string, unknown>; target: string };
type Listener = (e: unknown) => unknown;

function fakeWindow() {
	const posted: Posted[] = [];
	return {
		posted,
		frames: { length: 0 },
		postMessage: (msg: Record<string, unknown>, target: string) =>
			posted.push({ msg, target }),
		get document(): never {
			throw new Error("cross-origin");
		},
	};
}

describe("message bridge", () => {
	const g = globalThis as Record<string, unknown>;
	let listeners: Listener[];
	let origAdd: unknown;
	let origRemove: unknown;
	let origParent: unknown;

	const fire = async (e: unknown) => {
		for (const l of [...listeners]) await l(e);
	};
	const modelContext = () =>
		(
			document as unknown as {
				modelContext: {
					registerTool: (t: unknown) => Promise<void>;
					getTools: (
						o?: unknown,
					) => Promise<{ name: string; origin: string }[]>;
					executeTool: (t: unknown, i: unknown) => Promise<unknown>;
				};
			}
		).modelContext;

	beforeEach(() => {
		listeners = [];
		origAdd = g.addEventListener;
		origRemove = g.removeEventListener;
		origParent = g.parent;
		g.addEventListener = (type: string, fn: Listener) => {
			if (type === "message") listeners.push(fn);
		};
		g.removeEventListener = (type: string, fn: Listener) => {
			if (type === "message") listeners = listeners.filter((l) => l !== fn);
		};
		setupEnv();
	});
	afterEach(() => {
		g.addEventListener = origAdd;
		g.removeEventListener = origRemove;
		g.parent = origParent;
		installWebMcpPolyfill({ exposeToolsTo: [] });
	});

	async function setupProvider(exposeToolsTo?: string[]) {
		installWebMcpPolyfill(exposeToolsTo ? { exposeToolsTo } : undefined);
		let calls = 0;
		await modelContext().registerTool({
			name: "add_to_cart",
			description: "add",
			execute: async () => {
				calls++;
				return "ok";
			},
		});
		return () => calls;
	}

	const exec = (origin: string, source: unknown) => ({
		origin,
		source,
		data: {
			type: "WEBMCP_EXECUTE_TOOL_REQUEST",
			requestId: "r1",
			name: "add_to_cart",
			inputObject: {},
		},
	});

	test("exposes nothing by default", async () => {
		const calls = await setupProvider();
		const src = fakeWindow();
		await fire(exec("https://evil.example", src));
		await fire({
			origin: "https://evil.example",
			source: src,
			data: { type: "WEBMCP_GET_TOOLS_REQUEST", requestId: "r2" },
		});
		expect(calls()).toBe(0);
		expect(src.posted).toHaveLength(0);
	});

	test("foreign origin is ignored: no execution, no reply", async () => {
		const calls = await setupProvider(["https://good.example"]);
		const src = fakeWindow();
		await fire(exec("https://evil.example", src));
		expect(calls()).toBe(0);
		expect(src.posted).toHaveLength(0);
	});

	test("allowed origin executes and the reply targets event.origin", async () => {
		const calls = await setupProvider([
			"https://good.example",
			"https://other.example/",
		]);
		const src = fakeWindow();
		await fire(exec("https://good.example", src));
		expect(calls()).toBe(1);
		expect(src.posted).toHaveLength(1);
		expect(src.posted[0]?.target).toBe("https://good.example");
		expect(src.posted[0]?.msg.success).toBe(true);

		const src2 = fakeWindow();
		await fire(exec("https://other.example", src2));
		expect(src2.posted[0]?.target).toBe("https://other.example");
	});

	test("allowed origin gets the tool list, replied to event.origin", async () => {
		await setupProvider(["https://good.example"]);
		const src = fakeWindow();
		await fire({
			origin: "https://good.example",
			source: src,
			data: { type: "WEBMCP_GET_TOOLS_REQUEST", requestId: "r2" },
		});
		expect(src.posted[0]?.target).toBe("https://good.example");
		expect(src.posted[0]?.msg.type).toBe("WEBMCP_GET_TOOLS_RESPONSE");
	});

	test("a wildcard entry does not open the bridge", async () => {
		const calls = await setupProvider(["*"]);
		const src = fakeWindow();
		await fire(exec("https://evil.example", src));
		expect(calls()).toBe(0);
		expect(src.posted).toHaveLength(0);
	});

	describe("remote side", () => {
		function setupRemote() {
			const remote = fakeWindow();
			g.parent = remote;
			setupEnv([
				{
					getAttribute: (a: string) =>
						a === "src" ? "https://shop.example/app" : "tools",
				},
			]);
			installWebMcpPolyfill();
			const pending = modelContext().getTools();
			return { remote, pending, req: remote.posted[0] };
		}
		const response = (remote: unknown, origin: string, requestId: unknown) => ({
			origin,
			source: remote,
			data: {
				type: "WEBMCP_GET_TOOLS_RESPONSE",
				requestId,
				tools: [{ name: "search", description: "s", inputSchema: {} }],
			},
		});

		test("asks the trusted origin, not '*', with an unguessable id", async () => {
			const { req, pending } = setupRemote();
			expect(req?.target).toBe("https://shop.example");
			expect(String(req?.msg.requestId)).toMatch(/^[0-9a-f-]{36}$/);
			await pending;
		});

		test("does not ask at all when no origin is trusted", async () => {
			const remote = fakeWindow();
			g.parent = remote;
			setupEnv();
			installWebMcpPolyfill();
			expect(await modelContext().getTools()).toEqual([]);
			expect(remote.posted).toHaveLength(0);
		});

		test("ignores a response from the wrong origin", async () => {
			const { remote, pending, req } = setupRemote();
			await fire(response(remote, "https://evil.example", req?.msg.requestId));
			expect((await pending).map((t) => t.name)).toEqual([]);
		});

		test("accepts a response from the expected origin and pins tool.origin to it", async () => {
			const { remote, pending, req } = setupRemote();
			await fire(response(remote, "https://shop.example", req?.msg.requestId));
			const tools = await pending;
			expect(tools.map((t) => t.name)).toEqual(["search"]);
			expect(tools[0]?.origin).toBe("https://shop.example");
		});

		test("remote execute posts to the tool origin and ignores other origins", async () => {
			const { remote, pending, req } = setupRemote();
			await fire(response(remote, "https://shop.example", req?.msg.requestId));
			const [tool] = await pending;
			const run = modelContext().executeTool(tool, {});
			const call = remote.posted[1];
			expect(call?.target).toBe("https://shop.example");
			const reply = (origin: string, result: string) => ({
				origin,
				source: remote,
				data: {
					type: "WEBMCP_EXECUTE_TOOL_RESPONSE",
					requestId: call?.msg.requestId,
					success: true,
					result,
				},
			});
			await fire(reply("https://evil.example", "forged"));
			await fire(reply("https://shop.example", "real"));
			expect(await run).toBe("real");
		});
	});
});
