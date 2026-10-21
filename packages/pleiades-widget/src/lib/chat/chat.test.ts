import { describe, expect, test } from "bun:test";
import { ApiError, type StreamEvent, type WidgetApi } from "@/lib/api/api.ts";
import { type ChatState, createChat, pickToolMode } from "@/lib/chat/chat.ts";
import type { CustomerContext } from "@/lib/config/config.ts";
import { createSessionStore } from "@/lib/storage/storage.ts";
import type {
	WebMcpProvider,
	WebMcpToolDescriptor,
} from "@/lib/webmcp/webmcp.ts";

function memoryStorage(): Storage {
	const data = new Map<string, string>();
	return {
		get length() {
			return data.size;
		},
		clear: () => data.clear(),
		getItem: (key) => data.get(key) ?? null,
		key: (index) => [...data.keys()][index] ?? null,
		removeItem: (key) => void data.delete(key),
		setItem: (key, value) => void data.set(key, value),
	};
}

const scope = {
	agentUrl: "https://agent.example.com",
	publishableKey: "pk_abcdefghijklmnop",
};

interface Script {
	stream?: (
		token: string,
		threadId: string,
		text: string,
		signal?: AbortSignal,
		customerContext?: CustomerContext,
	) => AsyncGenerator<StreamEvent>;
	toolResult?: (
		token: string,
		threadId: string,
		callId: string,
		tool: string,
		result: unknown,
		isError: boolean,
		signal?: AbortSignal,
	) => AsyncGenerator<StreamEvent>;
	history?: (
		token: string,
		threadId: string,
	) => Promise<{
		items: {
			id: string;
			role: "user" | "assistant";
			content: string;
			createdAt: number;
		}[];
	}>;
}

function harness(
	script: Script = {},
	start = 1000,
	chatOptions: {
		idleTimeoutMs?: number;
		pingIntervalMs?: number;
		webmcp?: WebMcpProvider;
		mcpAvailable?: boolean;
		page?: () => string | undefined;
		toolChangeDebounceMs?: number;
	} = {},
) {
	const log: string[] = [];
	/** The `page` every request carried, in order. */
	const pages: (string | undefined)[] = [];
	const registeredTools: WebMcpToolDescriptor[][] = [];
	let visitors = 0;
	let threads = 0;
	const api: WidgetApi = {
		async createVisitor() {
			visitors += 1;
			log.push(`visitor#${visitors}`);
			return { visitorToken: `tok${visitors}`, expiresAt: start + 60_000 };
		},
		async createThread(token) {
			threads += 1;
			log.push(`thread#${threads}@${token}`);
			return { threadId: `t${threads}` };
		},
		async history(token, threadId) {
			log.push(`history:${threadId}@${token}`);
			return script.history ? script.history(token, threadId) : { items: [] };
		},
		async *streamMessage(token, threadId, text, signal, customerContext, page) {
			pages.push(page);
			log.push(`send:${threadId}@${token}:${text}`);
			yield* script.stream
				? script.stream(token, threadId, text, signal, customerContext)
				: (async function* () {
						yield { type: "delta", text: "ok" } as StreamEvent;
						yield { type: "done", elapsedMs: 1 } as StreamEvent;
					})();
		},
		async *sendToolResult(
			token,
			threadId,
			callId,
			tool,
			result,
			isError,
			signal,
			page,
		) {
			pages.push(page);
			log.push(`tool-result:${threadId}@${token}:${tool}`);
			yield* script.toolResult
				? script.toolResult(
						token,
						threadId,
						callId,
						tool,
						result,
						isError,
						signal,
					)
				: (async function* () {
						yield { type: "done", elapsedMs: 1 } as StreamEvent;
					})();
		},
		async registerWebMcpTools(token, threadId, webmcpTools) {
			log.push(
				`webmcp-register:${threadId}@${token}:${webmcpTools.map((t) => t.name).join(",")}`,
			);
			registeredTools.push(webmcpTools);
		},
	};
	const store = createSessionStore({ ...scope, storage: memoryStorage() });
	const { webmcp, ...restChatOptions } = chatOptions;
	const chat = createChat({
		api,
		store,
		webmcp,
		now: () => start,
		maxChars: 20,
		pingIntervalMs: 5,
		...restChatOptions,
	});
	const states: ChatState[] = [];
	chat.subscribe((state) => states.push(structuredClone(state)));
	return { chat, log, store, states, api, registeredTools, pages };
}

/** Rejects once `signal` fires, like a real `fetch` aborting mid-stream. */
function hangUntilAborted(signal?: AbortSignal): Promise<never> {
	return new Promise((_, reject) => {
		signal?.addEventListener("abort", () =>
			reject(Object.assign(new Error("Aborted"), { name: "AbortError" })),
		);
	});
}

async function* replies(...events: StreamEvent[]) {
	for (const event of events) yield event;
}

describe("createChat.init", () => {
	test("first visit: creates a visitor and a thread and remembers both", async () => {
		const { chat, log, store } = harness();
		await chat.init();
		expect(log).toEqual(["visitor#1", "thread#1@tok1", "history:t1@tok1"]);
		expect(store.load(1000)).toMatchObject({
			visitorToken: "tok1",
			threadId: "t1",
		});
		expect(chat.state.ready).toBe(true);
		expect(chat.state.messages).toEqual([]);
	});

	test("returning visit: reuses the token and thread and shows the history", async () => {
		const { chat, log, store } = harness({
			history: async () => ({
				items: [
					{ id: "1", role: "user", content: "hi", createdAt: 1 },
					{ id: "2", role: "assistant", content: "hello", createdAt: 2 },
				],
			}),
		});
		store.save({ visitorToken: "old", expiresAt: 9999, threadId: "tOld" });
		await chat.init();
		expect(log).toEqual(["history:tOld@old"]);
		expect(chat.state.messages.map((m) => [m.role, m.content])).toEqual([
			["user", "hi"],
			["assistant", "hello"],
		]);
	});

	test("a reply's flow lines come back with the history, a user turn has none", async () => {
		const steps = [
			{
				id: "search_products",
				phase: "done" as const,
				text: "Нашёл: Honeycrisp Apples",
			},
			{
				id: "add_to_cart",
				phase: "done" as const,
				text: "Добавлено в корзину: 1 × Honeycrisp Apples",
			},
		];
		const { chat, store } = harness({
			history: async () => ({
				items: [
					{ id: "1", role: "user", content: "купи яблоко", createdAt: 1 },
					{
						id: "2",
						role: "assistant",
						content: "Готово",
						createdAt: 2,
						steps,
					},
					{ id: "3", role: "assistant", content: "Привет", createdAt: 3 },
				],
			}),
		});
		store.save({ visitorToken: "old", expiresAt: 9999, threadId: "tOld" });

		await chat.init();

		expect(chat.state.messages.map((m) => m.steps)).toEqual([
			undefined,
			steps,
			undefined,
		]);
	});

	test("history longer than maxMessages is trimmed to the most recent ones", async () => {
		const items = Array.from({ length: 14 }, (_, i) => ({
			id: String(i),
			role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
			content: `m${i}`,
			createdAt: i,
		}));
		const { chat, store } = harness({ history: async () => ({ items }) });
		store.save({ visitorToken: "old", expiresAt: 9999, threadId: "tOld" });
		await chat.init();
		expect(chat.state.messages).toHaveLength(10);
		expect(chat.state.messages[0]?.content).toBe("m4");
		expect(chat.state.messages.at(-1)?.content).toBe("m13");
	});

	test("init is idempotent: calling it twice does the work once", async () => {
		const { chat, log } = harness();
		await Promise.all([chat.init(), chat.init()]);
		await chat.init();
		expect(log.filter((entry) => entry.startsWith("visitor")).length).toBe(1);
	});

	test("a token the server no longer knows (401 on history) starts a fresh session", async () => {
		let first = true;
		const { chat, log, store } = harness({
			history: async () => {
				if (first) {
					first = false;
					throw new ApiError(401);
				}
				return { items: [] };
			},
		});
		store.save({ visitorToken: "stale", expiresAt: 9999, threadId: "tStale" });
		await chat.init();
		expect(log).toContain("visitor#1");
		expect(store.load(1000)).toMatchObject({
			visitorToken: "tok1",
			threadId: "t1",
		});
		expect(chat.state.error).toBeUndefined();
	});

	test("403 (origin not allowed, channel off, blocked) is a terminal 'forbidden'", async () => {
		const { chat } = harness();
		chat.api.createVisitor = async () => {
			throw new ApiError(403);
		};
		await chat.init();
		expect(chat.state.error).toBe("forbidden");
		expect(chat.state.ready).toBe(false);
	});
});

describe("createChat.init when the channel is suspended", () => {
	test("402 is a terminal 'suspended'", async () => {
		const { chat } = harness();
		chat.api.createVisitor = async () => {
			throw new ApiError(402);
		};
		await chat.init();
		expect(chat.state.error).toBe("suspended");
		expect(chat.state.ready).toBe(false);
	});
});

describe("createChat.send", () => {
	test("keeps only the last 10 messages, dropping the oldest as new ones arrive", async () => {
		const { chat } = harness({
			stream: () =>
				replies({ type: "delta", text: "ok" }, { type: "done", elapsedMs: 1 }),
		});
		for (let i = 0; i < 6; i++) await chat.send(`msg${i}`);
		expect(chat.state.messages).toHaveLength(10);
		// 6 sends = 12 messages; the oldest pair (msg0's user+assistant) is gone.
		expect(chat.state.messages[0]).toMatchObject({
			role: "user",
			content: "msg1",
		});
		expect(chat.state.messages.at(-1)).toMatchObject({
			role: "assistant",
			content: "ok",
		});
	});

	test("streams the assistant reply into a message", async () => {
		const { chat, states } = harness({
			stream: () =>
				replies(
					{ type: "delta", text: "Hel" },
					{ type: "delta", text: "lo" },
					{ type: "done", elapsedMs: 1 },
				),
		});
		await chat.send("hi");
		expect(chat.state.messages.map((m) => [m.role, m.content])).toEqual([
			["user", "hi"],
			["assistant", "Hello"],
		]);
		expect(chat.state.busy).toBe(false);
		expect(
			states.some(
				(state) => state.busy && state.messages.at(-1)?.content === "Hel",
			),
		).toBe(true);
	});

	test("forwards customerContext through to the API call, and omits it when not given", async () => {
		const seen: (CustomerContext | undefined)[] = [];
		const { chat } = harness({
			stream: (_token, _threadId, _text, _signal, customerContext) => {
				seen.push(customerContext);
				return replies({ type: "done", elapsedMs: 1 });
			},
		});
		await chat.send("hi", { country: "Kazakhstan", city: "Qyzylorda" });
		await chat.send("again");
		expect(seen).toEqual([
			{ country: "Kazakhstan", city: "Qyzylorda" },
			undefined,
		]);
	});

	test("initialises the session on demand", async () => {
		const { chat, log } = harness();
		await chat.send("hi");
		expect(log).toEqual([
			"visitor#1",
			"thread#1@tok1",
			"history:t1@tok1",
			"send:t1@tok1:hi",
		]);
	});

	test("ignores blank text and a send while another is running", async () => {
		const { chat, log } = harness();
		await chat.send("   ");
		expect(log).toEqual([]);
		const first = chat.send("one");
		await chat.send("two");
		await first;
		expect(log.filter((entry) => entry.startsWith("send"))).toEqual([
			"send:t1@tok1:one",
		]);
	});

	test("text over the limit is rejected locally, without a request", async () => {
		const { chat, log } = harness();
		await chat.send("x".repeat(21));
		expect(chat.state.error).toBe("too_long");
		expect(log.some((entry) => entry.startsWith("send"))).toBe(false);
	});

	test("an expired token mid-conversation is renewed once and the message goes through", async () => {
		let calls = 0;
		const { chat, log } = harness({
			stream: (token) => {
				calls += 1;
				if (calls === 1) throw new ApiError(401);
				return replies(
					{ type: "delta", text: `via ${token}` },
					{ type: "done", elapsedMs: 1 },
				);
			},
		});
		await chat.send("hi");
		expect(chat.state.messages.at(-1)?.content).toBe("via tok2");
		expect(chat.state.error).toBeUndefined();
		expect(log.filter((entry) => entry.startsWith("visitor")).length).toBe(2);
	});

	test("maps failures to error codes and keeps the conversation usable", async () => {
		const cases: [ApiError, string][] = [
			[new ApiError(429), "rate_limited"],
			[new ApiError(413), "too_long"],
			[new ApiError(403), "forbidden"],
			[new ApiError(402), "suspended"],
			[new ApiError(0), "network"],
			[new ApiError(500), "failed"],
		];
		for (const [failure, code] of cases) {
			const { chat } = harness({
				stream: () => {
					throw failure;
				},
			});
			await chat.send("hi");
			expect(chat.state.error).toBe(code as never);
			expect(chat.state.busy).toBe(false);
			expect(chat.state.messages.map((m) => m.role)).toEqual(["user"]);
		}
	});

	test("a stream `error` line without a code is a fault on the server's side: it drops the empty assistant bubble and reports failure", async () => {
		const { chat } = harness({
			stream: () => replies({ type: "error", message: "boom" }),
		});
		await chat.send("hi");
		expect(chat.state.error).toBe("failed");
		expect(chat.state.errorHint).toBeUndefined();
		expect(chat.state.messages.map((m) => m.role)).toEqual(["user"]);
	});

	test("a task the site couldn't do is a request error, not a lost connection — it carries the site's own advice and locks nothing", async () => {
		let fail = true;
		const { chat, log } = harness({
			stream: () =>
				fail
					? replies(
							{
								type: "step",
								id: "search_products",
								phase: "failed",
								text: "Nothing found for «french baget»",
							},
							{
								type: "error",
								code: "task_failed",
								message: "no plan reached the goal",
								hint: "Try a broader word, or browse the Bakery department.",
							},
						)
					: replies(
							{ type: "delta", text: "ok" },
							{ type: "done", elapsedMs: 1 },
						),
		});

		await chat.send("buy a french baget");

		expect(chat.state.error).toBe("request");
		expect(chat.state.errorHint).toBe(
			"Try a broader word, or browse the Bakery department.",
		);
		// Not offline: the connection is fine, so nothing pings and nothing blocks.
		expect(chat.state.connection).toBe("online");
		expect(chat.state.busy).toBe(false);
		// The flow line the visitor saw stays.
		expect(chat.state.messages.at(-1)?.steps?.[0]).toMatchObject({
			phase: "failed",
		});

		// The next message goes out at once, and clears the error and its advice.
		fail = false;
		await chat.send("buy bread");
		expect(log.filter((entry) => entry.startsWith("send:"))).toHaveLength(2);
		expect(chat.state.error).toBeUndefined();
		expect(chat.state.errorHint).toBeUndefined();
	});

	test("a task failure without advice is still a request error", async () => {
		const { chat } = harness({
			stream: () =>
				replies({
					type: "error",
					code: "task_failed",
					message: "no plan reached the goal",
				}),
		});
		await chat.send("hi");
		expect(chat.state.error).toBe("request");
		expect(chat.state.errorHint).toBeUndefined();
	});

	test("a later successful send clears the error", async () => {
		let fail = true;
		const { chat } = harness({
			stream: () => {
				if (fail) throw new ApiError(429);
				return replies(
					{ type: "delta", text: "ok" },
					{ type: "done", elapsedMs: 1 },
				);
			},
		});
		await chat.send("hi");
		expect(chat.state.error).toBe("rate_limited");
		fail = false;
		await chat.send("again");
		expect(chat.state.error).toBeUndefined();
	});
});

describe("createChat.stop", () => {
	test("aborts the in-flight reply, keeps the partial text, and reports no error", async () => {
		const { chat, states } = harness({
			stream: (_t, _tid, _text, signal) =>
				(async function* () {
					yield { type: "delta", text: "partial" } as StreamEvent;
					yield await hangUntilAborted(signal);
				})(),
		});

		const sending = chat.send("hi");
		// Let the fake stream yield its first chunk before stopping.
		for (
			let i = 0;
			i < 50 && chat.state.messages.at(-1)?.content !== "partial";
			i++
		) {
			await Promise.resolve();
		}
		expect(chat.state.messages.at(-1)?.content).toBe("partial");
		chat.stop();
		await sending;

		expect(chat.state.busy).toBe(false);
		expect(chat.state.error).toBeUndefined();
		expect(chat.state.connection).toBe("online");
		expect(chat.state.messages.map((m) => [m.role, m.content])).toEqual([
			["user", "hi"],
			["assistant", "partial"],
		]);
		// Never went through the offline/error path.
		expect(states.some((s) => s.connection === "offline")).toBe(false);
	});

	test("does nothing when nothing is in flight", () => {
		const { chat } = harness();
		expect(() => chat.stop()).not.toThrow();
	});
});

describe("createChat connection loss", () => {
	test("no event for idleTimeoutMs goes offline, blocks sending, and recovers once a ping succeeds", async () => {
		const { chat, states } = harness(
			{
				stream: (_t, _tid, _text, signal) =>
					(async function* () {
						yield await hangUntilAborted(signal);
					})(),
			},
			1000,
			{ idleTimeoutMs: 5, pingIntervalMs: 5 },
		);

		await chat.send("hi");

		expect(chat.state.busy).toBe(false);
		expect(chat.state.connection).toBe("offline");
		expect(chat.state.error).toBe("network");

		// Sending while offline is a no-op — no new request, no thrown error.
		const before = states.length;
		await chat.send("again");
		expect(states.length).toBe(before);

		// The background ping (a plain history() call, which succeeds here)
		// flips the widget back online on its own.
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(chat.state.connection).toBe("online");
		expect(chat.state.error).toBeUndefined();
	});
});

describe("createChat.getVisitorToken", () => {
	test("returns the token, creating the session if needed (for the site's identify call)", async () => {
		const { chat } = harness();
		expect(await chat.getVisitorToken()).toBe("tok1");
	});
});

describe("createChat empty catalog", () => {
	const tools: WebMcpToolDescriptor[] = [];
	const page: WebMcpProvider = {
		listTools: async () => tools,
		callTool: async () => ({ result: "" }),
	};

	test("a page with no tools registers nothing (the polyfill is always there)", async () => {
		const { chat, log } = harness({}, 1000, { webmcp: page });
		await chat.init();

		expect(log.some((line) => line.startsWith("webmcp-register"))).toBe(false);
	});

	test("tools that were announced are cleared when they are gone", async () => {
		tools.push({ name: "set_pizza_size" });
		const { chat, log } = harness({}, 1000, { webmcp: page });
		await chat.init();
		tools.length = 0;
		chat.setToolMode("mcp");
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(log.filter((line) => line.startsWith("webmcp-register"))).toEqual([
			"webmcp-register:t1@tok1:set_pizza_size",
			"webmcp-register:t1@tok1:",
		]);
	});
});

describe("createChat.resetSession", () => {
	const site: WebMcpProvider = {
		listTools: async () => [{ name: "set_pizza_size" }],
		callTool: async () => ({ result: "" }),
	};

	test("starts a new thread for the same visitor, with an empty panel", async () => {
		const { chat, store } = harness();
		await chat.init();
		await chat.send("hi");
		expect(chat.state.messages).not.toHaveLength(0);

		await chat.resetSession();

		expect(store.load(1000)).toMatchObject({
			visitorToken: "tok1",
			threadId: "t2",
		});
		expect(chat.state.messages).toEqual([]);
	});

	test("the next message goes to the new thread", async () => {
		const { chat, log } = harness();
		await chat.init();
		await chat.resetSession();
		await chat.send("hello");

		expect(log).toContain("send:t2@tok1:hello");
	});

	test("the page's tools are announced for the new thread", async () => {
		const { chat, log } = harness({}, 1000, { webmcp: site });
		await chat.init();
		await chat.resetSession();

		expect(log).toContain("webmcp-register:t2@tok1:set_pizza_size");
	});

	test("before the panel ever opened it just opens a session", async () => {
		const { chat, store } = harness();
		await chat.resetSession();

		expect(store.load(1000)).toMatchObject({ visitorToken: "tok1" });
		expect(chat.state.ready).toBe(true);
	});

	test("a refused visitor token begins as a new visitor", async () => {
		const { chat, api, store } = harness();
		await chat.init();
		const createThread = api.createThread;
		let refused = false;
		api.createThread = async (token) => {
			if (!refused) {
				refused = true;
				throw new ApiError(401);
			}
			return createThread(token);
		};

		await chat.resetSession();

		expect(store.load(1000).visitorToken).toBe("tok2");
	});
});

describe("createChat tool mode", () => {
	test("defaults to webmcp when nothing was chosen before", () => {
		const { chat } = harness();
		expect(chat.state.toolMode).toBe("webmcp");
	});

	test("setToolMode updates state and persists across a fresh createChat", () => {
		const { chat, store, api } = harness();
		chat.setToolMode("mcp");
		expect(chat.state.toolMode).toBe("mcp");

		const again = createChat({ api, store, now: () => 1000, maxChars: 20 });
		expect(again.state.toolMode).toBe("mcp");
	});
});

describe("createChat available tool modes", () => {
	const provider: WebMcpProvider = {
		listTools: async () => [],
		callTool: async () => ({ result: "", isError: false }),
	};

	test("reports which modes can be used", () => {
		expect(harness().chat.state.available).toEqual({
			webmcp: false,
			mcp: false,
		});
		expect(
			harness({}, 1000, { webmcp: provider, mcpAvailable: true }).chat.state
				.available,
		).toEqual({ webmcp: true, mcp: true });
	});

	test("starts in the mode that exists: MCP when only MCP does", () => {
		const { chat } = harness({}, 1000, { mcpAvailable: true });
		expect(chat.state.toolMode).toBe("mcp");
		expect(chat.state.noTools).toBe(false);
	});

	test("a saved preference for a mode that is gone is not kept", () => {
		const { chat, store, api } = harness();
		chat.setToolMode("mcp");
		const again = createChat({
			api,
			store,
			webmcp: provider,
			now: () => 1000,
			maxChars: 20,
		});
		expect(again.state.toolMode).toBe("webmcp");
	});

	test("with neither mode the chat says there is nothing to use", () => {
		const { chat } = harness();
		expect(chat.state.noTools).toBe(true);
	});

	test("pickToolMode prefers the saved mode, then WebMCP, then MCP", () => {
		const both = { webmcp: true, mcp: true };
		expect(pickToolMode("mcp", both)).toBe("mcp");
		expect(pickToolMode(undefined, both)).toBe("webmcp");
		expect(pickToolMode("webmcp", { webmcp: false, mcp: true })).toBe("mcp");
		expect(pickToolMode("mcp", { webmcp: true, mcp: false })).toBe("webmcp");
		expect(pickToolMode("mcp", { webmcp: false, mcp: false })).toBe("mcp");
		expect(pickToolMode(undefined, { webmcp: false, mcp: false })).toBe(
			"webmcp",
		);
	});
});

describe("createChat WebMCP round trip", () => {
	const searchTool: WebMcpToolDescriptor = { name: "search_products" };

	test("a tool_call line is executed in-browser and the run resumes to done", async () => {
		let calledWith: [string, Record<string, unknown>] | undefined;
		const webmcp: WebMcpProvider = {
			listTools: async () => [searchTool],
			async callTool(name, args) {
				calledWith = [name, args];
				return { result: { items: [] } };
			},
		};
		const { chat, log } = harness(
			{
				stream: async function* () {
					yield {
						type: "tool_call",
						tool: "search_products",
						arguments: { query: "laptop" },
						callId: "call-1",
					} as StreamEvent;
				},
				toolResult: async function* () {
					yield { type: "delta", text: "found some" } as StreamEvent;
					yield { type: "done", elapsedMs: 1 } as StreamEvent;
				},
			},
			1000,
			{ webmcp },
		);

		await chat.send("find a laptop");

		expect(calledWith).toEqual(["search_products", { query: "laptop" }]);
		expect(chat.state.error).toBeUndefined();
		expect(chat.state.messages.at(-1)).toMatchObject({
			role: "assistant",
			content: "found some",
		});
		expect(log).toContain("tool-result:t1@tok1:search_products");
	});

	test("every request carries the page as it is at that moment — also after a tool navigated", async () => {
		let page = "/ru/store/a";
		const webmcp: WebMcpProvider = {
			listTools: async () => [searchTool],
			async callTool() {
				page = "/ru/store/a?q=laptop"; // the tool navigated
				return { result: "ok" };
			},
		};
		const { chat, pages } = harness(
			{
				stream: async function* () {
					yield {
						type: "tool_call",
						tool: "search_products",
						arguments: {},
						callId: "call-1",
					} as StreamEvent;
				},
			},
			1000,
			{ webmcp, page: () => page },
		);

		await chat.send("find a laptop");

		expect(pages).toEqual(["/ru/store/a", "/ru/store/a?q=laptop"]);
	});

	test("step lines build the flow in order; a later line with the same id replaces its earlier one", async () => {
		const { chat } = harness({
			stream: async function* () {
				yield {
					type: "step",
					id: "search",
					phase: "running",
					text: "Ищу «cheese»…",
				} as StreamEvent;
				yield {
					type: "step",
					id: "add",
					phase: "running",
					text: "Добавляю…",
				} as StreamEvent;
				yield {
					type: "step",
					id: "search",
					phase: "done",
					text: "Нашёл: Swiss Cheese",
				} as StreamEvent;
				yield { type: "delta", text: "Готово" } as StreamEvent;
				yield { type: "done", elapsedMs: 1 } as StreamEvent;
			},
		});

		await chat.send("купи сыр");

		expect(chat.state.messages.at(-1)).toMatchObject({
			role: "assistant",
			content: "Готово",
			steps: [
				{ id: "search", phase: "done", text: "Нашёл: Swiss Cheese" },
				{ id: "add", phase: "running", text: "Добавляю…" },
			],
		});
	});

	test("the flow keeps growing across the stream that resumes after a tool call", async () => {
		const webmcp: WebMcpProvider = {
			listTools: async () => [searchTool],
			callTool: async () => ({ result: "ok" }),
		};
		const { chat } = harness(
			{
				stream: async function* () {
					yield {
						type: "step",
						id: "search",
						phase: "running",
						text: "Ищу…",
					} as StreamEvent;
					yield {
						type: "tool_call",
						tool: "search_products",
						arguments: {},
						callId: "c1",
					} as StreamEvent;
				},
				toolResult: async function* () {
					yield {
						type: "step",
						id: "search",
						phase: "done",
						text: "Нашёл",
					} as StreamEvent;
					yield { type: "done", elapsedMs: 1 } as StreamEvent;
				},
			},
			1000,
			{ webmcp },
		);

		await chat.send("найди");

		expect(chat.state.messages.at(-1)?.steps).toEqual([
			{ id: "search", phase: "done", text: "Нашёл" },
		]);
	});

	test("a tool_call with no WebMCP provider fails cleanly instead of hanging", async () => {
		const { chat, log } = harness({
			stream: async function* () {
				yield {
					type: "tool_call",
					tool: "search_products",
					arguments: {},
					callId: "call-1",
				} as StreamEvent;
			},
		});

		await chat.send("find a laptop");

		expect(chat.state.busy).toBe(false);
		expect(chat.state.error).toBe("failed");
		expect(log.some((entry) => entry.startsWith("tool-result"))).toBe(false);
	});

	test("the tool catalog is registered once when the panel opens, and again on setToolMode — never per message", async () => {
		const webmcp: WebMcpProvider = {
			listTools: async () => [searchTool],
			callTool: async () => ({ result: {} }),
		};
		const { chat, log, registeredTools } = harness({}, 1000, { webmcp });
		// `setToolMode` fires its registration call without awaiting it (a UI
		// toggle shouldn't block on the network) — flush pending microtasks
		// before asserting on it.
		const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

		// Before any session exists: nothing to register yet, `open()` reads
		// the now-updated mode on its own once it runs.
		chat.setToolMode("mcp");
		await flush();
		expect(registeredTools).toEqual([]);

		// First send() triggers init()/open(): toolMode is "mcp", so the
		// catalog is empty and nothing was announced on this thread yet —
		// no call at all; this send's own message goes out on its own.
		await chat.send("hi");
		expect(registeredTools).toEqual([]);

		// Switching mode while already open registers again, directly.
		chat.setToolMode("webmcp");
		await flush();
		expect(registeredTools).toEqual([[searchTool]]);

		// A second message doesn't register again.
		await chat.send("hi again");
		expect(registeredTools).toEqual([[searchTool]]);
		expect(
			log.filter((entry) => entry.startsWith("webmcp-register")),
		).toHaveLength(1);
	});
});

describe("createChat follows toolchange", () => {
	/** A provider whose tool list the test changes and announces. */
	function changing(initial: WebMcpToolDescriptor[]) {
		let tools = initial;
		const listeners = new Set<() => void>();
		const provider: WebMcpProvider = {
			listTools: async () => tools,
			callTool: async () => ({ result: "" }),
			onToolsChange(listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		};
		return {
			provider,
			listeners,
			change(next: WebMcpToolDescriptor[]) {
				tools = next;
				for (const listener of [...listeners]) listener();
			},
		};
	}
	const wait = () => new Promise((resolve) => setTimeout(resolve, 15));

	test("tools that change while the panel is open are announced again", async () => {
		const site = changing([{ name: "search_products" }]);
		const { chat, registeredTools } = harness({}, 1000, {
			webmcp: site.provider,
			toolChangeDebounceMs: 1,
		});
		await chat.init();
		expect(registeredTools).toHaveLength(1);

		site.change([{ name: "search_products" }, { name: "get_cart" }]);
		await wait();

		expect(registeredTools).toHaveLength(2);
		expect(registeredTools[1]?.map((tool) => tool.name)).toEqual([
			"search_products",
			"get_cart",
		]);
	});

	test("a burst of toolchange events is one announcement", async () => {
		const site = changing([{ name: "a" }]);
		const { chat, registeredTools } = harness({}, 1000, {
			webmcp: site.provider,
			toolChangeDebounceMs: 5,
		});
		await chat.init();

		site.change([{ name: "a" }, { name: "b" }]);
		site.change([{ name: "a" }, { name: "b" }, { name: "c" }]);
		site.change([{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }]);
		await wait();

		expect(registeredTools).toHaveLength(2);
		expect(registeredTools[1]?.map((tool) => tool.name)).toEqual([
			"a",
			"b",
			"c",
			"d",
		]);
	});

	test("a toolchange that leaves the catalog as it was sends nothing", async () => {
		const site = changing([{ name: "a" }]);
		const { chat, registeredTools } = harness({}, 1000, {
			webmcp: site.provider,
			toolChangeDebounceMs: 1,
		});
		await chat.init();

		site.change([{ name: "a" }]);
		await wait();

		expect(registeredTools).toHaveLength(1);
	});

	test("nothing is announced before the panel has a session, and not after dispose()", async () => {
		const site = changing([{ name: "a" }]);
		const { chat, registeredTools } = harness({}, 1000, {
			webmcp: site.provider,
			toolChangeDebounceMs: 1,
		});

		site.change([{ name: "a" }, { name: "b" }]);
		await wait();
		expect(registeredTools).toHaveLength(0);

		await chat.init();
		expect(registeredTools).toHaveLength(1);
		expect(site.listeners.size).toBe(1);

		chat.dispose();
		expect(site.listeners.size).toBe(0);
		site.change([{ name: "z" }]);
		await wait();
		expect(registeredTools).toHaveLength(1);
	});
});

describe("createChat send() result", () => {
	const searchTool: WebMcpToolDescriptor = { name: "search_products" };

	test("resolves after a tool-call round trip with the reply, flow lines and the first run id", async () => {
		const webmcp: WebMcpProvider = {
			listTools: async () => [searchTool],
			callTool: async () => ({ result: { items: [] } }),
		};
		const { chat } = harness(
			{
				stream: () =>
					replies(
						{ type: "step", id: "plan", phase: "running", text: "Searching…" },
						{
							type: "tool_call",
							tool: "search_products",
							arguments: {},
							callId: "run-1",
						},
					),
				toolResult: () =>
					replies(
						{ type: "step", id: "plan", phase: "done", text: "Found 3" },
						{ type: "delta", text: "Here you go" },
						{ type: "done", elapsedMs: 1 },
					),
			},
			1000,
			{ webmcp },
		);

		const result = await chat.send("find a laptop");

		expect(result).toEqual({
			requestId: "run-1",
			reply: "Here you go",
			steps: [{ text: "Found 3", phase: "done" }],
			status: "done",
		});
		expect(chat.state.busy).toBe(false);
	});

	test("the id is the first tool_call of the turn, not a later one", async () => {
		let resumed = 0;
		const webmcp: WebMcpProvider = {
			listTools: async () => [searchTool],
			callTool: async () => ({ result: {} }),
		};
		const { chat } = harness(
			{
				stream: () =>
					replies({
						type: "tool_call",
						tool: "search_products",
						arguments: {},
						callId: "run-1",
					}),
				toolResult: () =>
					++resumed === 1
						? replies({
								type: "tool_call",
								tool: "search_products",
								arguments: {},
								callId: "run-2",
							})
						: replies({ type: "done", elapsedMs: 1 }),
			},
			1000,
			{ webmcp },
		);
		expect((await chat.send("a")).requestId).toBe("run-1");
	});

	test("a turn without tool calls has no id", async () => {
		const { chat } = harness();
		const result = await chat.send("hi");
		expect(result).toEqual({ reply: "ok", steps: [], status: "done" });
	});

	test("task_failed resolves as failed with the site's advice and the flow", async () => {
		const { chat } = harness({
			stream: () =>
				replies(
					{ type: "step", id: "s", phase: "failed", text: "Nothing found" },
					{
						type: "error",
						code: "task_failed",
						message: "no plan reached the goal",
						hint: "Try a broader word.",
					},
				),
		});
		expect(await chat.send("buy x")).toEqual({
			reply: "",
			steps: [{ text: "Nothing found", phase: "failed" }],
			status: "failed",
			error: "Try a broader word.",
		});
	});

	test("a server fault resolves as error", async () => {
		const { chat } = harness({
			stream: () => replies({ type: "error", message: "boom" }),
		});
		expect(await chat.send("hi")).toMatchObject({
			status: "error",
			error: "failed",
		});
	});

	test("while a turn is running a second send resolves as error busy and leaves the first alone", async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const { chat } = harness({
			stream: async function* () {
				await gate;
				yield { type: "delta", text: "late" } as StreamEvent;
				yield { type: "done", elapsedMs: 1 } as StreamEvent;
			},
		});
		const first = chat.send("one");
		const second = await chat.send("two");
		expect(second).toMatchObject({ status: "error", error: "busy" });
		release();
		expect(await first).toMatchObject({ status: "done", reply: "late" });
	});

	test("offline resolves as error not connected", async () => {
		const { chat } = harness(
			{
				stream: () => {
					throw new ApiError(0);
				},
			},
			1000,
			{ pingIntervalMs: 1_000_000 },
		);
		await chat.send("first");
		expect(await chat.send("second")).toMatchObject({
			status: "error",
			error: "not connected",
		});
	});
});
