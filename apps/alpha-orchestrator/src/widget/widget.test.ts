import { describe, expect, test } from "bun:test";
import type {
	Agent,
	AgentStreamEvent,
	DecisionAgent,
	DecisionAnswer,
	GoapAction,
	IncomingMessage,
	WebMcpToolDescriptor,
} from "@repo/core";
import { InMemoryWorldStateStore } from "@repo/core";
import { eq } from "drizzle-orm";
import { createBlockedIp, createWebChannel } from "../admin/channels.ts";
import { SqliteHistoryStore } from "../db/history-store.ts";
import { ChannelDirectory } from "../db/identity.ts";
import { RunBinding } from "../db/run-binding.ts";
import { channels, users, visitorTokens } from "../db/schema.ts";
import { createApp, type ServerDeps, type WidgetOptions } from "../server.ts";
import { testDb } from "../test/db.ts";

const ORIGIN = "https://shop.example";
const IP = "203.0.113.7";
const SALT = "salt";
const HOUR_MS = 60 * 60 * 1000;

const decisionAgent: DecisionAgent = { decide: async () => ({}) };

function setup(
	widget: Partial<WidgetOptions> = {},
	overrides: Partial<ServerDeps> = {},
) {
	const db = testDb();
	const runs = new RunBinding();
	const store = new SqliteHistoryStore(db, 10, runs);
	const calls: IncomingMessage[] = [];
	const agent: Agent = {
		async *handleMessageStream(message): AsyncGenerator<AgentStreamEvent> {
			calls.push(message);
			yield { type: "delta", text: "reply" };
			await store.append(
				{ threadId: message.threadId, userId: message.userId },
				[
					{ role: "user", content: message.chunks.join(" ") },
					{ role: "assistant", content: "reply" },
				],
			);
			yield { type: "done", elapsedMs: 1 };
		},
		resetThread: (threadId) => store.reset(threadId),
	};
	const clock = { now: 1_000_000 };
	const directory = new ChannelDirectory(db);
	const app = createApp({
		agent,
		decisionAgent,
		apiKey: "transport-key",
		adminApiKey: "admin-key",
		maxChunkChars: 100,
		db,
		channels: directory,
		runs,
		ipHashSalt: SALT,
		now: () => clock.now,
		widget: { trustProxy: true, ...widget },
		...overrides,
	});
	const shop = createWebChannel(
		db,
		{
			slug: "shop",
			name: "Shop",
			accessMode: "open",
			allowedOrigins: [ORIGIN],
		},
		clock.now,
	);
	directory.invalidate();
	return {
		db,
		app,
		calls,
		clock,
		directory,
		shop,
		publishableKey: shop.channel.publishableKey as string,
	};
}

type Ctx = ReturnType<typeof setup>;

function widgetRequest(
	path: string,
	init: {
		method?: string;
		token?: string;
		publishableKey?: string;
		origin?: string | null;
		ip?: string;
		body?: unknown;
		acceptEncoding?: string;
	} = {},
): Request {
	const headers: Record<string, string> = {
		"x-forwarded-for": init.ip ?? IP,
	};
	if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
	if (init.token) headers["x-visitor-token"] = init.token;
	if (init.publishableKey) headers["x-publishable-key"] = init.publishableKey;
	if (init.body !== undefined) headers["content-type"] = "application/json";
	if (init.acceptEncoding) headers["accept-encoding"] = init.acceptEncoding;
	return new Request(`http://harness.local${path}`, {
		method: init.method ?? "POST",
		headers,
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});
}

async function newVisitor(ctx: Ctx, ip = IP): Promise<string> {
	const response = await ctx.app.handle(
		widgetRequest("/v1/widget/visitors", {
			publishableKey: ctx.publishableKey,
			ip,
		}),
	);
	expect(response.status).toBe(201);
	return ((await response.json()) as { visitorToken: string }).visitorToken;
}

async function newThread(ctx: Ctx, token: string): Promise<string> {
	const response = await ctx.app.handle(
		widgetRequest("/v1/widget/threads", { token }),
	);
	expect(response.status).toBe(201);
	return ((await response.json()) as { threadId: string }).threadId;
}

/** `POST /v1/widget/tools` — what the widget calls once when its panel opens, not on every message (see docs/laya-autonomous-webmcp.md). */
async function registerTools(
	ctx: Ctx,
	token: string,
	threadId: string,
	webmcpTools: WebMcpToolDescriptor[],
): Promise<Response> {
	const response = await ctx.app.handle(
		widgetRequest("/v1/widget/tools", {
			token,
			body: { threadId, webmcpTools },
		}),
	);
	expect(response.status).toBe(204);
	return response;
}

function sendMessage(
	ctx: Ctx,
	token: string,
	threadId: string,
	text = "hello",
	ip = IP,
	customerContext?: Record<string, string | number | boolean>,
) {
	return ctx.app.handle(
		widgetRequest("/v1/widget/messages", {
			token,
			ip,
			body: {
				threadId,
				text,
				...(customerContext ? { customerContext } : {}),
			},
		}),
	);
}

function visitorUser(ctx: Ctx) {
	const row = ctx.db.select().from(visitorTokens).get();
	if (!row) throw new Error("no visitor");
	return ctx.db.select().from(users).where(eq(users.id, row.userId)).get();
}

describe("CORS preflight", () => {
	test("an origin allowed by some web channel gets the CORS headers", async () => {
		const ctx = setup();
		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/messages", { method: "OPTIONS" }),
		);
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
		expect(response.headers.get("access-control-allow-headers")).toContain(
			"x-visitor-token",
		);
	});

	test("an unknown origin gets 403 and no CORS headers", async () => {
		const ctx = setup();
		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/messages", {
				method: "OPTIONS",
				origin: "https://evil.example",
			}),
		);
		expect(response.status).toBe(403);
		expect(response.headers.get("access-control-allow-origin")).toBeNull();
	});
});

describe("POST /v1/widget/visitors", () => {
	test("creates an anonymous user and returns a token; only its hash is stored", async () => {
		const ctx = setup();
		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/visitors", {
				publishableKey: ctx.publishableKey,
			}),
		);
		expect(response.status).toBe(201);
		expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
		const body = (await response.json()) as {
			visitorToken: string;
			expiresAt: number;
		};
		expect(body.visitorToken.length).toBeGreaterThanOrEqual(43);
		expect(body.expiresAt).toBe(ctx.clock.now + 24 * HOUR_MS);

		const stored = ctx.db.select().from(visitorTokens).all();
		expect(stored).toHaveLength(1);
		expect(stored[0]?.tokenHash).not.toBe(body.visitorToken);
		expect(visitorUser(ctx)).toMatchObject({
			kind: "anonymous",
			externalUserId: null,
			channelId: ctx.shop.channel.id,
		});
	});

	test("unknown publishable key → 401", async () => {
		const ctx = setup();
		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/visitors", { publishableKey: "pk_nope" }),
		);
		expect(response.status).toBe(401);
	});

	test("origin not in the channel's allowedOrigins → 403, nobody created", async () => {
		const ctx = setup();
		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/visitors", {
				publishableKey: ctx.publishableKey,
				origin: "https://evil.example",
			}),
		);
		expect(response.status).toBe(403);
		expect(ctx.db.select().from(users).all()).toHaveLength(0);
	});

	test("missing Origin → 403", async () => {
		const ctx = setup();
		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/visitors", {
				publishableKey: ctx.publishableKey,
				origin: null,
			}),
		);
		expect(response.status).toBe(403);
	});

	test("disabled channel → 403", async () => {
		const ctx = setup();
		ctx.db
			.update(channels)
			.set({ disabledAt: 1 })
			.where(eq(channels.id, ctx.shop.channel.id))
			.run();
		ctx.directory.invalidate();
		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/visitors", {
				publishableKey: ctx.publishableKey,
			}),
		);
		expect(response.status).toBe(403);
	});

	test("blocked IP (global or for this channel, not expired) → 403", async () => {
		const ctx = setup();
		createBlockedIp(
			ctx.db,
			{ ip: IP, reason: "spam", expiresInHours: 1 },
			SALT,
			ctx.clock.now,
		);
		const blocked = await ctx.app.handle(
			widgetRequest("/v1/widget/visitors", {
				publishableKey: ctx.publishableKey,
			}),
		);
		expect(blocked.status).toBe(403);

		ctx.clock.now += 2 * HOUR_MS;
		const expired = await ctx.app.handle(
			widgetRequest("/v1/widget/visitors", {
				publishableKey: ctx.publishableKey,
			}),
		);
		expect(expired.status).toBe(201);
	});

	test("too many visitors from one IP → 429", async () => {
		const ctx = setup({ visitorsPerHourPerIp: 2 });
		await newVisitor(ctx);
		await newVisitor(ctx);
		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/visitors", {
				publishableKey: ctx.publishableKey,
			}),
		);
		expect(response.status).toBe(429);
		// A different IP is unaffected.
		await newVisitor(ctx, "198.51.100.1");
	});

	test("without TRUST_PROXY, X-Forwarded-For is ignored for IP blocking", async () => {
		const ctx = setup({ trustProxy: false });
		createBlockedIp(
			ctx.db,
			{ ip: IP, reason: "spam", expiresInHours: 1 },
			SALT,
			ctx.clock.now,
		);
		await newVisitor(ctx);
	});
});

describe("widget threads and messages", () => {
	test("full flow: thread → message streams NDJSON → history readable", async () => {
		const ctx = setup();
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);

		const response = await sendMessage(ctx, token, threadId, "hello");
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain(
			"application/x-ndjson",
		);
		expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
		const lines = (await response.text())
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(lines.map((line) => line.type)).toEqual(["delta", "done"]);
		expect(response.headers.get("content-encoding")).toBeNull();

		expect(ctx.calls).toHaveLength(1);
		expect(ctx.calls[0]?.threadId).toBe(threadId);
		expect(ctx.calls[0]?.userId).toBe(visitorUser(ctx)?.id as string);

		const history = await ctx.app.handle(
			widgetRequest(`/v1/widget/threads/${threadId}/messages`, {
				method: "GET",
				token,
			}),
		);
		expect(history.status).toBe(200);
		const body = (await history.json()) as {
			items: { role: string; content: string }[];
		};
		expect(body.items.map((item) => [item.role, item.content])).toEqual([
			["user", "hello"],
			["assistant", "reply"],
		]);
	});

	test("gzips the NDJSON stream when the client sends accept-encoding: gzip", async () => {
		const ctx = setup();
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);

		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/messages", {
				token,
				body: { threadId, text: "hello" },
				acceptEncoding: "gzip, deflate, br",
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-encoding")).toBe("gzip");
		const gunzip = new DecompressionStream(
			"gzip",
		) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
		const lines = (
			await new Response(
				(response.body as ReadableStream<Uint8Array>).pipeThrough(gunzip),
			).text()
		)
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(lines.map((line) => line.type)).toEqual(["delta", "done"]);
	});

	test("another visitor's thread → 404 on write and read, model not called", async () => {
		const ctx = setup();
		const owner = await newVisitor(ctx);
		const threadId = await newThread(ctx, owner);
		const intruder = await newVisitor(ctx);

		const write = await sendMessage(ctx, intruder, threadId);
		expect(write.status).toBe(404);
		const read = await ctx.app.handle(
			widgetRequest(`/v1/widget/threads/${threadId}/messages`, {
				method: "GET",
				token: intruder,
			}),
		);
		expect(read.status).toBe(404);
		expect(ctx.calls).toHaveLength(0);
	});

	test("unknown or expired token → 401", async () => {
		const ctx = setup();
		const unknown = await ctx.app.handle(
			widgetRequest("/v1/widget/threads", { token: "nope" }),
		);
		expect(unknown.status).toBe(401);

		const token = await newVisitor(ctx);
		ctx.clock.now += 25 * HOUR_MS;
		const expired = await ctx.app.handle(
			widgetRequest("/v1/widget/threads", { token }),
		);
		expect(expired.status).toBe(401);
	});

	test("the client IP is stored on the visitor (plaintext, for admins) and follows the visitor", async () => {
		const ctx = setup();
		const token = await newVisitor(ctx, "203.0.113.7");
		expect(visitorUser(ctx)?.lastIp).toBe("203.0.113.7");

		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/threads", { token, ip: "198.51.100.9" }),
		);
		expect(response.status).toBe(201);
		expect(visitorUser(ctx)?.lastIp).toBe("198.51.100.9");
	});

	test("using the token slides its expiry and bumps lastSeenAt", async () => {
		const ctx = setup();
		const token = await newVisitor(ctx);
		ctx.clock.now += 20 * HOUR_MS;
		await newThread(ctx, token);
		const row = ctx.db.select().from(visitorTokens).get();
		expect(row?.expiresAt).toBe(ctx.clock.now + 24 * HOUR_MS);
		expect(visitorUser(ctx)?.lastSeenAt).toBe(ctx.clock.now);

		// 20h later is past the original expiry, but within the slid one.
		ctx.clock.now += 20 * HOUR_MS;
		await newThread(ctx, token);
	});

	test("token from another origin than its channel allows → 403", async () => {
		const ctx = setup();
		const token = await newVisitor(ctx);
		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/threads", {
				token,
				origin: "https://evil.example",
			}),
		);
		expect(response.status).toBe(403);
	});

	test("blocked visitor → empty 403, model not called", async () => {
		const ctx = setup();
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		ctx.db
			.update(users)
			.set({ blockedAt: 1 })
			.where(eq(users.id, visitorUser(ctx)?.id as string))
			.run();

		const response = await sendMessage(ctx, token, threadId);
		expect(response.status).toBe(403);
		expect(await response.text()).toBe("");
		expect(ctx.calls).toHaveLength(0);
	});

	test("whitelist-mode channel: a visitor who isn't whitelisted → 403", async () => {
		const ctx = setup();
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		ctx.db
			.update(channels)
			.set({ accessMode: "whitelist" })
			.where(eq(channels.id, ctx.shop.channel.id))
			.run();
		ctx.directory.invalidate();

		const response = await sendMessage(ctx, token, threadId);
		expect(response.status).toBe(403);
		expect(ctx.calls).toHaveLength(0);
	});

	test("blocked IP → 403 on messages too", async () => {
		const ctx = setup();
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		createBlockedIp(
			ctx.db,
			{
				ip: IP,
				channelId: ctx.shop.channel.id,
				reason: "spam",
				expiresInHours: 1,
			},
			SALT,
			ctx.clock.now,
		);
		const response = await sendMessage(ctx, token, threadId);
		expect(response.status).toBe(403);
		expect(ctx.calls).toHaveLength(0);
	});

	test("text over the limit → 413, model not called", async () => {
		const ctx = setup({ maxTextChars: 5 });
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		const response = await sendMessage(ctx, token, threadId, "too long text");
		expect(response.status).toBe(413);
		expect(ctx.calls).toHaveLength(0);
	});

	test("customerContext is forwarded into WorldState under a customer: prefix", async () => {
		let seen: Record<string, unknown> | undefined;
		const probe: GoapAction = {
			name: "probe",
			// Cheaper than the static `generateReply` (cost 5) — the planner
			// picks this one, so its `execute()` observes the merged state.
			cost: 0,
			preconditions: {},
			effects: { replied: true },
			async execute(ctx) {
				seen = {
					city: ctx.state["customer:city"],
					country: ctx.state["customer:country"],
				};
				return { replied: true };
			},
		};
		const ctx = setup({}, { threadActionsFor: () => [probe] });
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);

		const response = await sendMessage(ctx, token, threadId, "hello", IP, {
			city: "Qyzylorda",
			country: "Kazakhstan",
		});
		// The plan only actually runs while the NDJSON stream is drained.
		await response.text();

		expect(response.status).toBe(200);
		expect(ctx.calls).toHaveLength(0);
		expect(seen).toEqual({ city: "Qyzylorda", country: "Kazakhstan" });
	});

	test("customerContext larger than the text limit → 413, model not called", async () => {
		const ctx = setup({ maxTextChars: 20 });
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);

		const response = await sendMessage(ctx, token, threadId, "hi", IP, {
			note: "x".repeat(40),
		});

		expect(response.status).toBe(413);
		expect(ctx.calls).toHaveLength(0);
	});

	test("rate limit per visitor → 429", async () => {
		const ctx = setup({ messagesPerMinute: 1 });
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		expect((await sendMessage(ctx, token, threadId)).status).toBe(200);
		expect((await sendMessage(ctx, token, threadId)).status).toBe(429);
		ctx.clock.now += 60_000;
		expect((await sendMessage(ctx, token, threadId)).status).toBe(200);
	});

	test("rate limit per IP applies across visitors → 429", async () => {
		const ctx = setup({ ipMessagesPerMinute: 1 });
		const first = await newVisitor(ctx);
		const second = await newVisitor(ctx);
		const firstThread = await newThread(ctx, first);
		const secondThread = await newThread(ctx, second);
		expect((await sendMessage(ctx, first, firstThread)).status).toBe(200);
		expect((await sendMessage(ctx, second, secondThread)).status).toBe(429);
	});

	test("widget routes don't accept the transport key as a substitute, and transport routes stay protected", async () => {
		const ctx = setup();
		const unauthenticated = await ctx.app.handle(
			new Request("http://harness.local/v1/messages", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ threadId: "t", userId: "u", text: "x" }),
			}),
		);
		expect(unauthenticated.status).toBe(401);
		const noToken = await ctx.app.handle(
			new Request("http://harness.local/v1/widget/threads", {
				method: "POST",
				headers: { authorization: "Bearer transport-key", origin: ORIGIN },
			}),
		);
		expect(noToken.status).toBe(401);
	});
});

describe("widget WebMCP round trip", () => {
	function choiceAnswer(choice: string): DecisionAnswer {
		return {
			type: "choice",
			choice,
			probabilities: { [choice]: 1 },
			confidence: 1,
			rl_agent: { act_probability: 1 },
		};
	}

	/** Classifies both the per-tool question (`createWebMcpActions`) and the per-message question (`classifyMessageIntent`) as the same intent — this test only needs one tool/one intent throughout. */
	function classifyingDecisionAgent(intent: string): DecisionAgent {
		return {
			async decide(_state, questions) {
				const result: Record<string, DecisionAnswer> = {};
				if (questions.intent) result.intent = choiceAnswer(intent);
				return result;
			},
		};
	}

	// "search" (not "addToCart") on purpose: PRECONDITIONS_BY_INTENT.addToCart
	// requires `itemSelected`, which nothing in this single-tool catalog can
	// produce — a real "no plan reached the goal" outcome (working as
	// designed, see docs/laya-autonomous-webmcp.md's "Ограничения"), just not
	// what this test is exercising. `search`'s preconditions are empty.
	const searchTool: WebMcpToolDescriptor = {
		name: "search_products",
		description: "Search the catalog",
		inputSchema: { type: "object", properties: { query: {} } },
	};

	test("a message that needs a WebMCP tool produces a tool_call line and persists a resumable checkpoint", async () => {
		const store = new InMemoryWorldStateStore();
		const ctx = setup(
			{},
			{
				decisionAgent: classifyingDecisionAgent("search"),
				worldStateStore: store,
			},
		);
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		await registerTools(ctx, token, threadId, [searchTool]);

		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/messages", {
				token,
				body: {
					threadId,
					text: "add the cheapest laptop to my cart",
				},
			}),
		);
		const text = await response.text();
		const lines = text
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

		// `replied` and `catalogSearched` are independent facts (`generateReply`
		// and `search_products` share no precondition), so `plan()` is free to
		// order either action first — only the guarantee actually proven at
		// the executor level (`executor.test.ts`, "doesn't run any action
		// after the one that waits") applies: the stream must end on
		// `tool_call`, not `done`, whichever action ran (or didn't) before it.
		const last = lines.at(-1);
		expect(last).toMatchObject({
			type: "tool_call",
			tool: "search_products",
			arguments: {},
		});
		expect(typeof last?.callId).toBe("string");
		expect(lines.some((line) => line.type === "done")).toBe(false);

		const checkpoint = await store.load(threadId);
		expect(checkpoint).toMatchObject({
			goal: { replied: true, catalogSearched: true },
		});
	});

	test("POST /v1/widget/tool-results resumes with the browser's outcome and reaches done", async () => {
		const ctx = setup(
			{},
			{ decisionAgent: classifyingDecisionAgent("search") },
		);
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		await registerTools(ctx, token, threadId, [searchTool]);
		await ctx.app
			.handle(
				widgetRequest("/v1/widget/messages", {
					token,
					body: {
						threadId,
						text: "add the cheapest laptop to my cart",
					},
				}),
			)
			.then((response) => response.text());

		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/tool-results", {
				token,
				body: {
					threadId,
					callId: "call-1",
					tool: "search_products",
					result: { ok: true },
					isError: false,
				},
			}),
		);
		const events = (await response.text())
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

		expect(events.at(-1)).toMatchObject({ type: "done" });
		expect(ctx.calls).toHaveLength(1);
	});

	test("a tool catalog too large for a single message no longer 413s /v1/widget/messages — it's registered separately, once", async () => {
		const ctx = setup(
			{ maxTextChars: 50 },
			{ decisionAgent: classifyingDecisionAgent("search") },
		);
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		// Larger than maxTextChars (50) on its own — would have 413'd the old
		// per-message `webmcpTools` field.
		const bigTool: WebMcpToolDescriptor = {
			name: "search_products",
			description: "x".repeat(200),
		};
		await registerTools(ctx, token, threadId, [bigTool]);

		const response = await sendMessage(ctx, token, threadId, "hi");

		expect(response.status).toBe(200);
	});

	test("registering the catalog once is reused across several messages, not resent", async () => {
		const ctx = setup(
			{},
			{ decisionAgent: classifyingDecisionAgent("search") },
		);
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		await registerTools(ctx, token, threadId, [searchTool]);

		const first = await ctx.app.handle(
			widgetRequest("/v1/widget/messages", {
				token,
				body: { threadId, text: "find a laptop" },
			}),
		);
		const firstLine = (await first.text()).trim().split("\n").at(-1);
		expect(JSON.parse(firstLine ?? "{}")).toMatchObject({
			type: "tool_call",
			tool: "search_products",
		});

		// A second, independent message on a *fresh* thread — no per-message
		// webmcpTools, no re-registration — still sees the tool because
		// registration is per visitor's active tab, keyed by thread, and this
		// reuses the same one.
		const second = await ctx.app.handle(
			widgetRequest("/v1/widget/messages", {
				token,
				body: { threadId, text: "find a laptop again" },
			}),
		);
		expect(second.status).toBe(200);
	});

	test("registering an empty catalog clears it — later messages fall back to a plain reply", async () => {
		const ctx = setup(
			{},
			{ decisionAgent: classifyingDecisionAgent("search") },
		);
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		await registerTools(ctx, token, threadId, [searchTool]);
		await registerTools(ctx, token, threadId, []);

		const response = await sendMessage(ctx, token, threadId, "find a laptop");
		const lines = (await response.text())
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

		expect(lines.some((line) => line.type === "tool_call")).toBe(false);
		expect(lines.at(-1)).toMatchObject({ type: "done" });
	});

	test("POST /v1/widget/tools rejects a catalog larger than maxWebmcpToolsChars → 413", async () => {
		const ctx = setup(
			{ maxWebmcpToolsChars: 100 },
			{ decisionAgent: classifyingDecisionAgent("search") },
		);
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);

		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/tools", {
				token,
				body: {
					threadId,
					webmcpTools: [
						{ name: "search_products", description: "x".repeat(200) },
					],
				},
			}),
		);

		expect(response.status).toBe(413);
	});

	test("POST /v1/widget/tool-results for another visitor's thread → 404, nothing resumed", async () => {
		const ctx = setup(
			{},
			{ decisionAgent: classifyingDecisionAgent("search") },
		);
		const owner = await newVisitor(ctx);
		const threadId = await newThread(ctx, owner);
		const intruder = await newVisitor(ctx);

		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/tool-results", {
				token: intruder,
				body: {
					threadId,
					callId: "call-1",
					tool: "search_products",
					result: {},
				},
			}),
		);

		expect(response.status).toBe(404);
	});
});
