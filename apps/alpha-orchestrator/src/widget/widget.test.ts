import { describe, expect, test } from "bun:test";
import type {
	Agent,
	AgentStreamEvent,
	DecisionAgent,
	IncomingMessage,
} from "@repo/core";
import { eq } from "drizzle-orm";
import { createBlockedIp, createWebChannel } from "../admin/channels.ts";
import { SqliteHistoryStore } from "../db/history-store.ts";
import { ChannelDirectory } from "../db/identity.ts";
import { RunBinding } from "../db/run-binding.ts";
import { channels, users, visitorTokens } from "../db/schema.ts";
import { createApp, type WidgetOptions } from "../server.ts";
import { testDb } from "../test/db.ts";

const ORIGIN = "https://shop.example";
const IP = "203.0.113.7";
const SALT = "salt";
const HOUR_MS = 60 * 60 * 1000;

const decisionAgent: DecisionAgent = { decide: async () => ({}) };

function setup(widget: Partial<WidgetOptions> = {}) {
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
	} = {},
): Request {
	const headers: Record<string, string> = {
		"x-forwarded-for": init.ip ?? IP,
	};
	if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
	if (init.token) headers["x-visitor-token"] = init.token;
	if (init.publishableKey) headers["x-publishable-key"] = init.publishableKey;
	if (init.body !== undefined) headers["content-type"] = "application/json";
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

function sendMessage(
	ctx: Ctx,
	token: string,
	threadId: string,
	text = "hello",
	ip = IP,
) {
	return ctx.app.handle(
		widgetRequest("/v1/widget/messages", {
			token,
			ip,
			body: { threadId, text },
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
