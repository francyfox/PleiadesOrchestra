import { describe, expect, test } from "bun:test";
import { ApiError, type StreamEvent, type WidgetApi } from "./api";
import { type ChatState, createChat } from "./chat";
import { createSessionStore } from "./storage";

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

function harness(script: Script = {}, start = 1000) {
	const log: string[] = [];
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
		async *streamMessage(token, threadId, text) {
			log.push(`send:${threadId}@${token}:${text}`);
			yield* script.stream
				? script.stream(token, threadId, text)
				: (async function* () {
						yield { type: "delta", text: "ok" } as StreamEvent;
						yield { type: "done", elapsedMs: 1 } as StreamEvent;
					})();
		},
	};
	const store = createSessionStore({ ...scope, storage: memoryStorage() });
	const chat = createChat({ api, store, now: () => start, maxChars: 20 });
	const states: ChatState[] = [];
	chat.subscribe((state) => states.push(structuredClone(state)));
	return { chat, log, store, states, api };
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

describe("createChat.getVisitorToken", () => {
	test("returns the token, creating the session if needed (for the site's identify call)", async () => {
		const { chat } = harness();
		expect(await chat.getVisitorToken()).toBe("tok1");
	});
});
