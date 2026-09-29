import { describe, expect, test } from "bun:test";
import { ApiError, type StreamEvent, type WidgetApi } from "./api";
import { type ChatState, createChat } from "./chat";
import type { CustomerContext } from "./config";
import { createSessionStore } from "./storage";
import type { WebMcpProvider, WebMcpToolDescriptor } from "./webmcp";

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
	} = {},
) {
	const log: string[] = [];
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
		async *streamMessage(token, threadId, text, signal, customerContext) {
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
		) {
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
	return { chat, log, store, states, api, registeredTools };
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

	test("a stream `error` line drops the empty assistant bubble and reports failure", async () => {
		const { chat } = harness({
			stream: () =>
				replies({ type: "error", message: "no plan reached the goal" }),
		});
		await chat.send("hi");
		expect(chat.state.error).toBe("failed");
		expect(chat.state.messages.map((m) => m.role)).toEqual(["user"]);
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

		// First send() triggers init()/open(), which registers once — empty,
		// since toolMode is "mcp" — then this send's own message goes out
		// with no further tool-catalog call.
		await chat.send("hi");
		expect(registeredTools).toEqual([[]]);

		// Switching mode while already open registers again, directly.
		chat.setToolMode("webmcp");
		await flush();
		expect(registeredTools).toEqual([[], [searchTool]]);

		// A second message doesn't register a third time.
		await chat.send("hi again");
		expect(registeredTools).toEqual([[], [searchTool]]);
		expect(
			log.filter((entry) => entry.startsWith("webmcp-register")),
		).toHaveLength(2);
	});
});
