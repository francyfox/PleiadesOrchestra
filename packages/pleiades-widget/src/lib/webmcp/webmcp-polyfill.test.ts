import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { installWebMcpPolyfill } from "@/lib/webmcp/webmcp-polyfill.ts";

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
			if (sel === 'form[toolname]') return [];
			if (sel === 'style') return [];
			if (sel === 'iframe') return iframes.map((f) => ({ ...f, contentWindow: null }));
			if (sel === 'iframe[allow~="tools"]') return iframes.filter((f) => f.getAttribute("allow") === "tools");
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
	(globalThis as Record<string, unknown>).location = { href: "http://localhost/" };
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
		expect((document as unknown as Record<string, unknown>).modelContext).toBeUndefined();
		installWebMcpPolyfill();
		expect((document as unknown as Record<string, unknown>).modelContext).toBeDefined();
	});

	test("is idempotent — second call returns the same object", () => {
		setupEnv();
		installWebMcpPolyfill();
		const first = (document as unknown as Record<string, unknown>).modelContext;
		installWebMcpPolyfill();
		const second = (document as unknown as Record<string, unknown>).modelContext;
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
		const mc = (document as unknown as { modelContext: { registerTool: (t: unknown) => Promise<void> } }).modelContext;
		let err: unknown;
		try { await mc.registerTool({ name: "bad name!", description: "x" }); } catch (e) { err = e; }
		expect(err).toMatchObject({ name: "InvalidStateError" });
	});

	test("throws when name is missing", async () => {
		const mc = (document as unknown as { modelContext: { registerTool: (t: unknown) => Promise<void> } }).modelContext;
		let err: unknown;
		try { await mc.registerTool({ description: "x" }); } catch (e) { err = e; }
		expect(err).toBeDefined();
	});

	test("dispatches toolchange after successful registration", async () => {
		const mc = (document as unknown as { modelContext: EventTarget & { registerTool: (t: unknown) => Promise<void> } }).modelContext;
		let fired = 0;
		mc.addEventListener("toolchange", () => { fired++; });
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
		const mc = (document as unknown as { modelContext: { registerTool: (t: unknown) => Promise<void>; getTools: () => Promise<{ name: string }[]> } }).modelContext;
		await mc.registerTool({ name: "local_tool", description: "local" });
		const tools = await mc.getTools();
		expect(tools.map((t) => t.name)).toContain("local_tool");
	});

	test("excludes a cross-origin tool when no allow='tools' iframe is present", async () => {
		// Inject a tool with a foreign origin directly (simulates what getRemoteTools returns).
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).__webmcp_registered_tools?.set("remote_tool", {
			name: "remote_tool", description: "remote", origin: "https://demo.example.com",
			window: globalThis, inputSchema: undefined, _execute: () => {},
		});

		const mc = (document as unknown as { modelContext: { getTools: () => Promise<{ name: string }[]> } }).modelContext;
		const tools = await mc.getTools();
		expect(tools.map((t) => t.name)).not.toContain("remote_tool");
	});

	test("includes a cross-origin tool when fromOrigins is specified explicitly", async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).__webmcp_registered_tools?.set("remote_tool", {
			name: "remote_tool", description: "remote", origin: "https://demo.example.com",
			window: globalThis, inputSchema: undefined, _execute: () => {},
		});

		const mc = (document as unknown as { modelContext: { getTools: (o: { fromOrigins: string[] }) => Promise<{ name: string }[]> } }).modelContext;
		const tools = await mc.getTools({ fromOrigins: ["https://demo.example.com"] });
		expect(tools.map((t) => t.name)).toContain("remote_tool");
	});

	test("trusts cross-origin tool when a matching allow='tools' iframe is in the DOM", async () => {
		// Re-install with a fake iframe in the DOM.
		(globalThis as Record<string, unknown>).document = undefined;
		(globalThis as Record<string, unknown>).__webmcp_registered_tools = undefined;
		setupEnv([
			{
				getAttribute: (a: string) =>
					a === "src" ? "https://demo.example.com/app" : a === "allow" ? "tools" : null,
			},
		]);
		installWebMcpPolyfill();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).__webmcp_registered_tools?.set("remote_tool", {
			name: "remote_tool", description: "remote", origin: "https://demo.example.com",
			window: globalThis, inputSchema: undefined, _execute: () => {},
		});

		const mc = (document as unknown as { modelContext: { getTools: () => Promise<{ name: string }[]> } }).modelContext;
		const tools = await mc.getTools();
		expect(tools.map((t) => t.name)).toContain("remote_tool");
	});

	test("does NOT trust cross-origin tool when iframe lacks allow='tools'", async () => {
		(globalThis as Record<string, unknown>).document = undefined;
		(globalThis as Record<string, unknown>).__webmcp_registered_tools = undefined;
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
			name: "remote_tool", description: "remote", origin: "https://demo.example.com",
			window: globalThis, inputSchema: undefined, _execute: () => {},
		});

		const mc = (document as unknown as { modelContext: { getTools: () => Promise<{ name: string }[]> } }).modelContext;
		const tools = await mc.getTools();
		expect(tools.map((t) => t.name)).not.toContain("remote_tool");
	});
});
