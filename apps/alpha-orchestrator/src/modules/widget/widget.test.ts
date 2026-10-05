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
import { type AppDeps, createApp } from "../../app.ts";
import { createBlockedIp } from "../blocked-ips/blocked-ips.service.ts";
import { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import { createWebChannel } from "../channels/channels.service.ts";
import {
	channels,
	mcpCatalogs,
	planRuns,
	users,
	visitorTokens,
} from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import { SqliteHistoryStore } from "../history/history.ts";
import { RunBinding } from "../run-binding/run-binding.ts";
import type { WidgetOptions } from "./widget.types.ts";

const ORIGIN = "https://shop.example";
const IP = "203.0.113.7";
const SALT = "salt";
const HOUR_MS = 60 * 60 * 1000;

const decisionAgent: DecisionAgent = { decide: async () => ({}) };

function setup(
	widget: Partial<WidgetOptions> = {},
	overrides: Partial<AppDeps> = {},
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
					text: "the cheapest laptop please",
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
						text: "the cheapest laptop please",
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

	test("the run that resumes after a tool result belongs to the same request as the one that waited", async () => {
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
					body: { threadId, text: "the cheapest laptop please" },
				}),
			)
			.then((response) => response.text());
		await ctx.app
			.handle(
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
			)
			.then((response) => response.text());

		const runs = ctx.db
			.select()
			.from(planRuns)
			.orderBy(planRuns.createdAt, planRuns.id)
			.all();
		expect(runs).toHaveLength(2);
		const root = runs.find((run) => run.prompt !== null);
		expect(root?.prompt).toBe("the cheapest laptop please");
		expect(runs.map((run) => run.rootRunId)).toEqual([
			root?.id ?? null,
			root?.id ?? null,
		]);
	});

	test("the same tool catalog opened again is not classified again, and is remembered for the admin MCP page; a changed one is", async () => {
		let classifications = 0;
		const counting: DecisionAgent = {
			async decide(_state, questions) {
				const result: Record<string, DecisionAnswer> = {};
				if (questions.intent) {
					classifications += 1;
					result.intent = choiceAnswer("search");
				}
				return result;
			},
		};
		const ctx = setup({}, { decisionAgent: counting });
		const token = await newVisitor(ctx);
		// A name that says nothing, so Laya is asked (names like `search_products` are read without it).
		const tool: WebMcpToolDescriptor = {
			name: "helper_tool",
			description: "Search the catalog",
		};
		const first = await newThread(ctx, token);
		const second = await newThread(ctx, token);

		await registerTools(ctx, token, first, [tool]);
		expect(classifications).toBe(1);

		// Same tools, another thread (or the panel opened again): no new Laya call.
		await registerTools(ctx, token, second, [tool]);
		await registerTools(ctx, token, first, [tool]);
		expect(classifications).toBe(1);

		await registerTools(ctx, token, first, [
			{ ...tool, description: "Search the catalog by words" },
		]);
		expect(classifications).toBe(2);

		const rows = ctx.db.select().from(mcpCatalogs).all();
		expect(rows.map((row) => row.registrations).sort()).toEqual([1, 3]);
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

describe("widget shopping flow: «купи 1 сыр»", () => {
	const choice = (value: string): DecisionAnswer => ({
		type: "choice",
		choice: value,
		probabilities: { [value]: 1 },
		confidence: 1,
		rl_agent: { act_probability: 1 },
	});

	const INTENT_OF_TOOL: Record<string, string> = {
		choose_store: "chooseStore",
		search_products: "search",
		add_to_cart: "addToCart",
	};

	/** Laya stand-in: tools by name, the message as a purchase, the store as Penny Pantry. */
	const laya: DecisionAgent = {
		async decide(state, questions) {
			const name = (state as { name?: string }).name;
			const answers: Record<string, DecisionAnswer> = {};
			for (const key of Object.keys(questions)) {
				answers[key] =
					key === "intent"
						? choice(name ? (INTENT_OF_TOOL[name] ?? "other") : "addToCart")
						: choice("Penny Pantry");
			}
			return answers;
		},
	};

	const productRequestAgent: Agent = {
		async *handleMessageStream() {
			yield { type: "delta", text: '{"query":"cheese","quantity":1}' };
			yield { type: "done", elapsedMs: 1 };
		},
		async resetThread() {},
	};

	const tools: WebMcpToolDescriptor[] = [
		{
			name: "choose_store",
			description: "Open one of the stores",
			inputSchema: {
				type: "object",
				properties: {
					store: {
						type: "string",
						enum: ["Greenleaf Market", "Penny Pantry"],
					},
				},
				required: ["store"],
			} as WebMcpToolDescriptor["inputSchema"],
		},
		{
			name: "search_products",
			description: "Search the open store",
			inputSchema: { type: "object", properties: { query: {} } },
		},
		{
			name: "add_to_cart",
			description: "Add products to the cart",
			inputSchema: {
				type: "object",
				properties: {
					items: {
						type: "array",
						items: {
							type: "object",
							properties: { product: {}, quantity: {} },
							required: ["product"],
						},
					},
				},
				required: ["items"],
			} as WebMcpToolDescriptor["inputSchema"],
		},
	];

	const parseLines = (text: string) =>
		text
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

	test("the browser is asked for the three tools in order, then the reply says what was done", async () => {
		const ctx = setup({}, { decisionAgent: laya, productRequestAgent });
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		await registerTools(ctx, token, threadId, tools);

		const answers: Record<string, string> = {
			choose_store: "Penny Pantry is open.",
			search_products:
				"Showing 2:\n- Aged Cheddar — $5 — OUT OF STOCK\n- Mozzarella Cheese — $3.99 (8 oz) — in stock",
			add_to_cart: "Added 1 × Mozzarella Cheese.",
		};

		const asked: { tool: string; arguments: unknown }[] = [];
		// What the user is shown while it happens: `step` lines of every stream.
		const flow: string[] = [];
		const noteSteps = (
			lines: { type: string; id?: string; phase?: string; text?: string }[],
		) => {
			for (const line of lines) {
				if (line.type !== "step") continue;
				const text = `${line.phase}: ${line.text}`;
				if (flow.at(-1) !== text) flow.push(text);
			}
		};
		let lines = parseLines(
			await (await sendMessage(ctx, token, threadId, "купи 1 сыр")).text(),
		);
		noteSteps(lines);
		for (let step = 0; step < 6 && lines.at(-1)?.type === "tool_call"; step++) {
			const call = lines.at(-1);
			asked.push({ tool: call.tool, arguments: call.arguments });
			const response = await ctx.app.handle(
				widgetRequest("/v1/widget/tool-results", {
					token,
					body: {
						threadId,
						callId: call.callId,
						tool: call.tool,
						result: { content: [{ type: "text", text: answers[call.tool] }] },
						isError: false,
					},
				}),
			);
			lines = parseLines(await response.text());
			noteSteps(lines);
		}

		expect(asked).toEqual([
			{ tool: "choose_store", arguments: { store: "Penny Pantry" } },
			{ tool: "search_products", arguments: { query: "cheese" } },
			{
				tool: "add_to_cart",
				arguments: { items: [{ product: "Mozzarella Cheese", quantity: 1 }] },
			},
		]);
		expect(flow).toEqual([
			"running: Разбираю запрос…",
			"done: Понял: 1 × «cheese»",
			"running: Выбираю магазин…",
			"done: Выбран магазин: Penny Pantry",
			"running: Открываю магазин Penny Pantry…",
			"done: Магазин открыт: Penny Pantry",
			"running: Ищу «cheese»…",
			"done: Нашёл: Mozzarella Cheese",
			"running: Добавляю в корзину: 1 × Mozzarella Cheese…",
			"done: Добавлено в корзину: 1 × Mozzarella Cheese",
		]);
		expect(lines.at(-1)).toMatchObject({ type: "done" });
		// The reply is written last and is told what happened.
		expect(ctx.calls.at(-1)?.chunks[0]).toContain("1 × Mozzarella Cheese");
	});

	test("the next request in the same conversation reuses the store that is already open", async () => {
		const ctx = setup({}, { decisionAgent: laya, productRequestAgent });
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		await registerTools(ctx, token, threadId, tools);

		const run = async () => {
			const asked: string[] = [];
			let lines = parseLines(
				await (await sendMessage(ctx, token, threadId, "купи 1 сыр")).text(),
			);
			for (
				let step = 0;
				step < 6 && lines.at(-1)?.type === "tool_call";
				step++
			) {
				const call = lines.at(-1);
				asked.push(call.tool);
				lines = parseLines(
					await (
						await ctx.app.handle(
							widgetRequest("/v1/widget/tool-results", {
								token,
								body: {
									threadId,
									callId: call.callId,
									tool: call.tool,
									result:
										call.tool === "search_products"
											? "- Swiss Cheese — $4 — in stock"
											: "ok",
									isError: false,
								},
							}),
						)
					).text(),
				);
			}
			return asked;
		};

		expect(await run()).toEqual([
			"choose_store",
			"search_products",
			"add_to_cart",
		]);
		// Searched/added facts belong to the first request; the store stays.
		expect(await run()).toEqual(["search_products", "add_to_cart"]);
	});

	test("a search that finds nothing ends with an error line, not a loop", async () => {
		const ctx = setup({}, { decisionAgent: laya, productRequestAgent });
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		await registerTools(ctx, token, threadId, tools);

		let lines = parseLines(
			await (await sendMessage(ctx, token, threadId, "купи 1 сыр")).text(),
		);
		let toolCalls = 0;
		for (let step = 0; step < 8 && lines.at(-1)?.type === "tool_call"; step++) {
			const call = lines.at(-1);
			toolCalls++;
			lines = parseLines(
				await (
					await ctx.app.handle(
						widgetRequest("/v1/widget/tool-results", {
							token,
							body: {
								threadId,
								callId: call.callId,
								tool: call.tool,
								result:
									call.tool === "search_products"
										? 'No products found at Penny Pantry for "cheese".'
										: "ok",
								isError: false,
							},
						}),
					)
				).text(),
			);
		}
		expect(toolCalls).toBe(2); // choose_store, search_products — and no add_to_cart
		expect(lines.at(-1)).toMatchObject({ type: "error" });
	});
});

describe("the page the visitor is on", () => {
	const intentSeen: unknown[] = [];
	const laya: DecisionAgent = {
		async decide(state, questions) {
			if (questions.intent) intentSeen.push(state);
			return {};
		},
	};

	/** An action that records the state it runs with — cheaper than `generateReply`, so it wins the plan. */
	function stateRecorder() {
		const seen: Record<string, unknown>[] = [];
		const action: GoapAction = {
			name: "recorder",
			cost: 0,
			preconditions: {},
			effects: { replied: true },
			async execute(ctx) {
				seen.push({ ...ctx.state });
				return { replied: true };
			},
		};
		return { seen, action };
	}

	test("a message carries the page into the world state, with its language", async () => {
		const { seen, action } = stateRecorder();
		const ctx = setup(
			{},
			{ decisionAgent: laya, threadActionsFor: () => [action] },
		);
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);

		await (
			await ctx.app.handle(
				widgetRequest("/v1/widget/messages", {
					token,
					body: {
						threadId,
						text: "hi",
						page: "/ru/store/greenleaf?q=milk&utm_source=x",
					},
				}),
			)
		).text();

		expect(seen[0]).toMatchObject({
			"page:path": "/ru/store/greenleaf?q=milk&utm_source=x",
			"page:lang": "ru",
		});
	});

	test("Laya gets only the message when it sorts it, never the page: the page used to outweigh the words", async () => {
		intentSeen.length = 0;
		const { action } = stateRecorder();
		const ctx = setup(
			{},
			{ decisionAgent: laya, threadActionsFor: () => [action] },
		);
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		await (
			await ctx.app.handle(
				widgetRequest("/v1/widget/messages", {
					token,
					// No word in it decides, so Laya is asked.
					body: { threadId, text: "ноутбук, пожалуйста", page: "/en/cart" },
				}),
			)
		).text();
		expect(intentSeen[0]).toEqual({ message: "ноутбук, пожалуйста" });
	});

	test("no page is fine: no page facts", async () => {
		const { seen, action } = stateRecorder();
		const ctx = setup(
			{},
			{ decisionAgent: laya, threadActionsFor: () => [action] },
		);
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		await (await sendMessage(ctx, token, threadId, "hi")).text();
		expect(seen[0]?.["page:path"]).toBeUndefined();
		expect(seen[0]?.["page:lang"]).toBeUndefined();
	});

	test("a page longer than 512 characters is refused", async () => {
		const ctx = setup();
		const token = await newVisitor(ctx);
		const threadId = await newThread(ctx, token);
		const response = await ctx.app.handle(
			widgetRequest("/v1/widget/messages", {
				token,
				body: { threadId, text: "hi", page: `/${"a".repeat(600)}` },
			}),
		);
		expect(response.status).toBe(422);
	});

	test("after a tool ran, the page the tool left the visitor on replaces the old one", async () => {
		const ctx = setup({}, { decisionAgent: laya });
		const store = new InMemoryWorldStateStore();
		const threadId = "thread-x";
		await store.save(threadId, {
			state: { "page:path": "/old", "page:lang": "ru" },
			goal: { replied: true },
		});
		const { prepareResume } = await import("../reply/reply.service.ts");
		const prepared = await prepareResume(
			{
				worldStateStore: store,
				webmcpCatalog: new Map(),
				actions: [],
			} as never,
			threadId,
			"run",
			{
				tool: "search_products",
				isError: false,
				page: "/store/greenleaf?q=cheese",
			},
		);
		expect(prepared.state["page:path"]).toBe("/store/greenleaf?q=cheese");
		expect(prepared.state["page:lang"]).toBeUndefined();
		void ctx;
	});
});
