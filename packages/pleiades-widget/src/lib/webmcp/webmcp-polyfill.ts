/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Adapted from https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/demos/shared/webmcp-polyfill.js
 * Converted to a TypeScript module with a named export so the widget can call
 * it explicitly during initialisation instead of running it as a page-level IIFE.
 *
 * Sets up `document.modelContext` on any browser that lacks native WebMCP
 * support. The widget's `createNavigatorWebMcpProvider()` then detects the API
 * and WebMCP works cross-browser via Pleiades as the AI bridge.
 */

type McpDocument = Document & {
	modelContext?: ModelContext & {
		dispatchEvent(event: Event): void;
		executeTool?(tool: NormalizedTool, input: unknown): Promise<unknown>;
	};
};

interface AnyWindow extends Omit<Window, "document"> {
	document: McpDocument;
	__webmcp_registered_tools?: Map<string, NormalizedTool>;
	ToolActivatedEvent?: typeof ToolActivatedEvent;
	ToolCancelEvent?: typeof ToolCancelEvent;
}

interface RawTool {
	name: string;
	description?: string;
	inputSchema?: unknown;
	annotations?: unknown;
	execute?: (args: unknown, options?: unknown) => unknown;
}

interface NormalizedTool extends RawTool {
	window: AnyWindow;
	origin: string;
	_form?: HTMLFormElement;
	_isRemote?: boolean;
	_execute?: (args: unknown, options?: unknown) => unknown;
}

interface SerializableTool {
	name: string;
	description?: string;
	inputSchema?: unknown;
	origin: string;
	annotations?: unknown;
}

const win = globalThis as unknown as AnyWindow;

function getLocalTools(w: AnyWindow): NormalizedTool[] {
	const tools: NormalizedTool[] = [];

	if (w.__webmcp_registered_tools) {
		for (const tool of w.__webmcp_registered_tools.values()) {
			tools.push(tool);
		}
	}

	const forms = w.document.querySelectorAll<HTMLFormElement>("form[toolname]");
	for (const form of forms) {
		const name = form.getAttribute("toolname");
		const description = form.getAttribute("tooldescription") ?? "";
		if (!name) continue;

		const properties: Record<string, unknown> = {};
		const required: string[] = [];
		const elements = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
			"input[name], select[name], textarea[name]",
		);
		for (const el of elements) {
			const propName = el.name;
			const propDesc = el.getAttribute("toolparamdescription") ?? "";
			let type = "string";
			let enumValues: string[] | undefined;

			if (el.tagName === "SELECT") {
				enumValues = Array.from((el as HTMLSelectElement).options).map((o) => o.value || o.text);
			} else if ((el as HTMLInputElement).type === "number" || (el as HTMLInputElement).type === "range") {
				type = "number";
			} else if ((el as HTMLInputElement).type === "checkbox") {
				type = "boolean";
			}

			const property: Record<string, unknown> = { type };
			if (propDesc) property.description = propDesc;
			if (enumValues) property.enum = enumValues;
			properties[propName] = property;
			if (el.hasAttribute("required")) required.push(propName);
		}

		const inputSchema: Record<string, unknown> = { type: "object", properties };
		if (required.length > 0) inputSchema.required = required;

		tools.push({ name, description, inputSchema, window: w, origin: w.origin, _form: form });
	}

	return tools;
}

function getRemoteTools(w: Window): Promise<NormalizedTool[]> {
	return new Promise((resolve) => {
		const requestId = Math.random().toString(36).substring(2);
		const timer = setTimeout(() => {
			window.removeEventListener("message", listener);
			resolve([]);
		}, 500);

		const listener = (event: MessageEvent) => {
			const { data, source } = event;
			if (
				source === w &&
				data?.type === "WEBMCP_GET_TOOLS_RESPONSE" &&
				data.requestId === requestId
			) {
				clearTimeout(timer);
				window.removeEventListener("message", listener);
				const toolsWithWindow = ((data.tools as SerializableTool[]) ?? []).map((t) => ({
					...t,
					window: w as AnyWindow,
					_isRemote: true,
				}));
				resolve(toolsWithWindow);
			}
		};

		window.addEventListener("message", listener);
		(w as Window & { postMessage(msg: unknown, target: string): void }).postMessage(
			{ type: "WEBMCP_GET_TOOLS_REQUEST", requestId },
			"*",
		);
	});
}

class ToolActivatedEvent extends Event {
	readonly #toolName: string;
	constructor(type: string, init: EventInit & { toolName?: string } = {}) {
		super(type, init);
		this.#toolName = init.toolName ?? "";
	}
	get toolName() { return this.#toolName; }
}

class ToolCancelEvent extends Event {
	readonly #toolName: string;
	constructor(type: string, init: EventInit & { toolName?: string } = {}) {
		super(type, init);
		this.#toolName = init.toolName ?? "";
	}
	get toolName() { return this.#toolName; }
}

function dispatchToolEvent(w: AnyWindow, type: "toolactivated" | "toolcancel", toolName: string) {
	const Cls = type === "toolactivated" ? ToolActivatedEvent : ToolCancelEvent;
	const event = new Cls(type, { toolName });
	try { w.document?.modelContext?.dispatchEvent(event); } catch { /* cross-origin */ }
}

class ModelContext extends EventTarget {
	#ontoolchange: EventListenerOrEventListenerObject | null = null;
	#ontoolactivated: EventListenerOrEventListenerObject | null = null;
	#ontoolcancel: EventListenerOrEventListenerObject | null = null;

	get ontoolchange() { return this.#ontoolchange; }
	set ontoolchange(h) {
		if (this.#ontoolchange) this.removeEventListener("toolchange", this.#ontoolchange);
		this.#ontoolchange = h;
		if (h) this.addEventListener("toolchange", h);
	}
	get ontoolactivated() { return this.#ontoolactivated; }
	set ontoolactivated(h) {
		if (this.#ontoolactivated) this.removeEventListener("toolactivated", this.#ontoolactivated);
		this.#ontoolactivated = h;
		if (h) this.addEventListener("toolactivated", h);
	}
	get ontoolcancel() { return this.#ontoolcancel; }
	set ontoolcancel(h) {
		if (this.#ontoolcancel) this.removeEventListener("toolcancel", this.#ontoolcancel);
		this.#ontoolcancel = h;
		if (h) this.addEventListener("toolcancel", h);
	}

	async registerTool(tool: RawTool, options: { signal?: AbortSignal } = {}) {
		if (!tool || typeof tool !== "object") throw new DOMException("Invalid tool object", "TypeError");
		const { name, description } = tool;
		if (!name || typeof name !== "string") throw new DOMException("Invalid tool name", "InvalidStateError");
		if (!description || typeof description !== "string") throw new DOMException("Invalid tool description", "InvalidStateError");
		if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(name)) throw new DOMException("Invalid tool name format", "InvalidStateError");
		if (win.__webmcp_registered_tools!.has(name)) throw new DOMException(`Tool "${name}" is already registered`, "InvalidStateError");
		if (tool.inputSchema) JSON.stringify(tool.inputSchema); // throws if not serializable

		const { signal } = options;
		if (signal) {
			if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
			signal.addEventListener("abort", () => this.#unregisterTool(name));
		}

		win.__webmcp_registered_tools!.set(name, {
			name,
			description,
			inputSchema: tool.inputSchema,
			annotations: tool.annotations,
			window: win,
			origin: win.origin,
			_execute: tool.execute,
		});
		this.dispatchEvent(new Event("toolchange"));
	}

	#unregisterTool(name: string) {
		if (win.__webmcp_registered_tools!.delete(name)) this.dispatchEvent(new Event("toolchange"));
	}

	async getTools(options: { fromOrigins?: string[] } = {}): Promise<NormalizedTool[]> {
		const allWindows = new Set<Window>([win]);
		if (win.parent) {
			allWindows.add(win.parent);
			try { for (let i = 0; i < win.parent.frames.length; i++) allWindows.add(win.parent.frames[i] as Window); } catch { /* cross-origin */ }
		}
		try {
			for (const iframe of document.querySelectorAll<HTMLIFrameElement>("iframe")) {
				if (iframe.contentWindow) allWindows.add(iframe.contentWindow);
			}
		} catch { /* cross-origin */ }

		const allTools: NormalizedTool[] = [];
		const remotePromises: Promise<NormalizedTool[]>[] = [];

		for (const w of allWindows) {
			if (w === win) {
				allTools.push(...getLocalTools(win));
			} else {
				let sameOrigin = false;
				try { sameOrigin = !!(w as AnyWindow).document; } catch { /* cross-origin */ }
				if (sameOrigin) allTools.push(...getLocalTools(w as AnyWindow));
				else remotePromises.push(getRemoteTools(w));
			}
		}
		for (const batch of await Promise.all(remotePromises)) allTools.push(...batch);

		const seen = new Set<string>();
		const unique = allTools.filter((t) => !seen.has(t.name) && seen.add(t.name));

		const origins = Array.isArray(options?.fromOrigins) ? new Set(options.fromOrigins) : null;
		return unique.filter((t) => t.origin === win.origin || (origins && origins.size > 0 && origins.has(t.origin)));
	}

	async executeTool(tool: NormalizedTool, inputObject: unknown, options: { signal?: AbortSignal } = {}): Promise<unknown> {
		if (inputObject === undefined) throw new TypeError("inputObject is undefined");
		JSON.stringify(inputObject); // throws if not serializable

		const w = tool.window ?? win;

		if (tool._isRemote) {
			return new Promise((resolve, reject) => {
				const requestId = Math.random().toString(36).substring(2);
				const listener = (event: MessageEvent) => {
					const { data, source } = event;
					if (source === w && data?.type === "WEBMCP_EXECUTE_TOOL_RESPONSE" && data.requestId === requestId) {
						window.removeEventListener("message", listener);
						if (data.success) resolve(data.result);
						else reject(new Error(data.error));
					}
				};
				window.addEventListener("message", listener);
				w.postMessage({ type: "WEBMCP_EXECUTE_TOOL_REQUEST", requestId, name: tool.name, inputObject }, "*");
			});
		}

		const wDoc = (w as AnyWindow).document as McpDocument | undefined;
		if (w !== win && wDoc?.modelContext?.executeTool) {
			try {
				return await wDoc.modelContext.executeTool(tool, inputObject);
			} catch (e) {
				if ((e as Error).message?.startsWith("Failed to parse input")) {
					return await wDoc.modelContext.executeTool(tool, JSON.stringify(inputObject));
				}
				throw e;
			}
		}

		let parsedArgs = inputObject;
		if (typeof inputObject === "string") {
			try { parsedArgs = JSON.parse(inputObject); } catch { /* keep as string */ }
		}

		if (w.__webmcp_registered_tools?.has(tool.name)) {
			return w.__webmcp_registered_tools.get(tool.name)!._execute!(parsedArgs, options);
		}

		const form = tool._form ?? w.document.querySelector<HTMLFormElement>(`form[toolname="${tool.name}"]`);
		if (!form) throw new Error(`Tool ${tool.name} not found`);

		form.classList.add("tool-form-active");
		const submitBtn = form.querySelector<HTMLButtonElement | HTMLInputElement>(
			"button[type=submit], input[type=submit]",
		);
		submitBtn?.classList.add("tool-submit-active");

		const args = parsedArgs as Record<string, unknown>;
		for (const [key, value] of Object.entries(args)) {
			const input = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | null
				?? form.querySelector<HTMLInputElement>(`[name="${key}"]`);
			if (!input) continue;
			if (input.tagName === "SELECT") { (input as HTMLSelectElement).value = String(value); }
			else if ((input as HTMLInputElement).type === "checkbox") { (input as HTMLInputElement).checked = !!value; }
			else if ((input as HTMLInputElement).type === "radio") {
				const radio = form.querySelector<HTMLInputElement>(`input[name="${key}"][value="${value}"]`);
				if (radio) radio.checked = true;
			} else { input.value = String(value); }
			input.dispatchEvent(new Event("input", { bubbles: true }));
			input.dispatchEvent(new Event("change", { bubbles: true }));
		}

		dispatchToolEvent(w, "toolactivated", tool.name);

		return new Promise<unknown>((resolve, reject) => {
			let done = false;
			let observer: MutationObserver;

			const cleanup = () => {
				form.classList.remove("tool-form-active");
				submitBtn?.classList.remove("tool-submit-active");
				form.removeEventListener("reset", onReset);
				form.removeEventListener("submit", onSubmit, true);
				observer?.disconnect();
			};

			if (options?.signal) {
				if (options.signal.aborted) { cleanup(); reject(options.signal.reason ?? new DOMException("Aborted", "AbortError")); return; }
				options.signal.addEventListener("abort", () => {
					if (done) return;
					done = true; cleanup(); dispatchToolEvent(w, "toolcancel", tool.name);
					reject(options.signal!.reason ?? new DOMException("Aborted", "AbortError"));
				}, { once: true });
			}

			const onReset = () => { done = true; cleanup(); dispatchToolEvent(w, "toolcancel", tool.name); resolve(null); };
			form.addEventListener("reset", onReset);

			const onSubmit = (e: Event & { agentInvoked?: boolean; respondWith?: (v: unknown) => void }) => {
				if (done) return;
				e.agentInvoked = true;
				e.respondWith = (val) => {
					if (val && typeof (val as Promise<unknown>).then === "function") {
						(val as Promise<unknown>)
							.then((v) => { done = true; cleanup(); resolve(v); })
							.catch((err: unknown) => { done = true; cleanup(); resolve({ error: (err as Error).message ?? err }); });
					} else { done = true; cleanup(); resolve(val); }
				};
			};
			form.addEventListener("submit", onSubmit as EventListener, true);

			observer = new MutationObserver((mutations) => {
				const removed = !w.document.body.contains(form);
				const attrChanged = mutations.some(
					(m) => m.type === "attributes" && m.target === form &&
						(m.attributeName === "toolname" || m.attributeName === "tooldescription"),
				);
				if (removed || attrChanged) { done = true; cleanup(); dispatchToolEvent(w, "toolcancel", tool.name); resolve(null); }
			});
			observer.observe(form, { attributes: true });
			if (form.parentNode) observer.observe(form.parentNode, { childList: true });

			if (form.hasAttribute("toolautosubmit")) {
				form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
				setTimeout(() => { if (!done) { cleanup(); resolve(null); } }, 5000);
			} else { submitBtn?.focus(); }
		});
	}
}

function polyfillCSSPseudoClasses(w: AnyWindow) {
	const styles: string[] = [];
	const process = (text: string) => {
		const out = text.replace(/:tool-form-active/g, ".tool-form-active").replace(/:tool-submit-active/g, ".tool-submit-active");
		return out !== text ? out : null;
	};
	for (const sheet of Array.from(w.document.styleSheets)) {
		if ((sheet as CSSStyleSheet).href) {
			fetch((sheet as CSSStyleSheet).href!)
				.then((r) => r.text())
				.then((text) => {
					const out = process(text);
					if (out) { const el = w.document.createElement("style"); el.textContent = out; w.document.head.appendChild(el); }
				})
				.catch(() => { /* ignore */ });
		} else {
			try {
				for (const rule of Array.from((sheet as CSSStyleSheet).cssRules ?? [])) {
					const out = process(rule.cssText);
					if (out) styles.push(out);
				}
			} catch { /* cross-origin */ }
		}
	}
	for (const tag of Array.from(w.document.querySelectorAll("style"))) {
		const out = process(tag.textContent ?? "");
		if (out) styles.push(out);
	}
	if (styles.length > 0) {
		const el = w.document.createElement("style");
		el.textContent = styles.join("\n");
		w.document.head.appendChild(el);
	}
}

function observeDeclarativeTools(modelContext: ModelContext) {
	const sig = () =>
		JSON.stringify(
			getLocalTools(win)
				.filter((t) => t._form)
				.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
		);
	let current = sig();
	let scheduled = false;
	const check = () => {
		scheduled = false;
		const next = sig();
		if (next !== current) { current = next; modelContext.dispatchEvent(new Event("toolchange")); }
	};
	const observer = new MutationObserver(() => { if (!scheduled) { scheduled = true; queueMicrotask(check); } });
	observer.observe(win.document.documentElement, {
		subtree: true, childList: true, attributes: true,
		attributeFilter: ["toolname", "tooldescription", "toolparamdescription", "name", "type", "required"],
	});
}

/**
 * Installs `document.modelContext` (WebMCP) on browsers that lack native
 * support. Safe to call multiple times — skips if already present.
 */
export function installWebMcpPolyfill(): void {
	if ((win.document as unknown as { modelContext?: unknown }).modelContext) return;

	win.__webmcp_registered_tools ??= new Map();

	const modelContext = new ModelContext();

	win.ToolActivatedEvent = ToolActivatedEvent;
	win.ToolCancelEvent = ToolCancelEvent;

	Object.defineProperty(win.document, "modelContext", {
		value: modelContext,
		writable: false,
		configurable: true,
	});

	win.addEventListener("message", async ({ data, source }: MessageEvent) => {
		if (data?.type === "WEBMCP_GET_TOOLS_REQUEST") {
			const local = getLocalTools(win).map(({ name, description, inputSchema, origin, annotations }) => ({
				name, description, inputSchema, origin, annotations,
			}));
			(source as Window).postMessage({ type: "WEBMCP_GET_TOOLS_RESPONSE", requestId: data.requestId, tools: local }, "*");
		}
		if (data?.type === "WEBMCP_EXECUTE_TOOL_REQUEST") {
			const { name, inputObject, args, requestId } = data as { name: string; inputObject?: unknown; args?: unknown; requestId: string };
			try {
				const tool = getLocalTools(win).find((t) => t.name === name);
				if (!tool) throw new Error(`Tool ${name} not found`);
				const input = inputObject !== undefined ? inputObject : args;
				let result: unknown;
				try { result = await modelContext.executeTool(tool, input); }
				catch (e) {
					if ((e as Error).message?.startsWith("Failed to parse input"))
						result = await modelContext.executeTool(tool, JSON.stringify(input));
					else throw e;
				}
				(source as Window).postMessage({ type: "WEBMCP_EXECUTE_TOOL_RESPONSE", requestId, success: true, result }, "*");
			} catch (err) {
				(source as Window).postMessage({ type: "WEBMCP_EXECUTE_TOOL_RESPONSE", requestId, success: false, error: (err as Error).message ?? String(err) }, "*");
			}
		}
	});

	observeDeclarativeTools(modelContext);

	if (win.document.readyState === "loading") {
		win.document.addEventListener("DOMContentLoaded", () => polyfillCSSPseudoClasses(win));
	} else {
		polyfillCSSPseudoClasses(win);
	}
}
