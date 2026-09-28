import { describe, expect, test } from "bun:test";
import type { Agent, DecisionAgent } from "@repo/core";
import { eq } from "drizzle-orm";
import { createWebChannel } from "../admin/channels.ts";
import { ChannelDirectory } from "../db/identity.ts";
import { RunBinding } from "../db/run-binding.ts";
import {
	llmCalls,
	messages,
	planRuns,
	threads,
	users,
	visitorTokens,
} from "../db/schema.ts";
import { createApp } from "../server.ts";
import { testDb } from "../test/db.ts";

const ORIGIN = "https://shop.example";
const decisionAgent: DecisionAgent = { decide: async () => ({}) };
const agent: Agent = {
	async *handleMessageStream() {},
	resetThread: async () => {},
};

function setup() {
	const db = testDb();
	const directory = new ChannelDirectory(db);
	const clock = { now: 1_000_000 };
	const app = createApp({
		agent,
		decisionAgent,
		apiKey: "transport-key",
		adminApiKey: "admin-key",
		maxChunkChars: 100,
		db,
		channels: directory,
		runs: new RunBinding(),
		ipHashSalt: "salt",
		now: () => clock.now,
		widget: { retentionPerUser: 10 },
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
	const other = createWebChannel(
		db,
		{
			slug: "other",
			name: "Other",
			accessMode: "open",
			allowedOrigins: [ORIGIN],
		},
		clock.now,
	);
	directory.invalidate();
	return { db, app, clock, shop, other };
}

type Ctx = ReturnType<typeof setup>;

async function newVisitor(ctx: Ctx, channel = ctx.shop.channel) {
	const response = await ctx.app.handle(
		new Request("http://harness.local/v1/widget/visitors", {
			method: "POST",
			headers: {
				origin: ORIGIN,
				"x-publishable-key": channel.publishableKey as string,
			},
		}),
	);
	expect(response.status).toBe(201);
	const { visitorToken } = (await response.json()) as { visitorToken: string };
	const userId = ctx.db.select().from(visitorTokens).all().at(-1)
		?.userId as string;
	return { visitorToken, userId };
}

function identify(
	ctx: Ctx,
	body: unknown,
	secret = ctx.shop.secretKey,
	slug = "shop",
) {
	return ctx.app.handle(
		new Request(`http://harness.local/v1/channels/${slug}/identify`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${secret}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
		}),
	);
}

/** Adds `count` messages (and one run + usage row) for a user on a fresh thread. */
function seedHistory(ctx: Ctx, userId: string, count: number, label: string) {
	const threadId = crypto.randomUUID();
	ctx.db
		.insert(threads)
		.values({
			id: threadId,
			userId,
			channelId: ctx.shop.channel.id,
			externalThreadId: null,
			createdAt: ctx.clock.now,
		})
		.run();
	const runId = crypto.randomUUID();
	ctx.db
		.insert(planRuns)
		.values({
			id: runId,
			userId,
			threadId,
			goal: {},
			succeeded: true,
			attempts: 1,
			durationMs: 1,
			createdAt: ctx.clock.now,
		})
		.run();
	for (let i = 0; i < count; i++) {
		ctx.db
			.insert(messages)
			.values({
				threadId,
				userId,
				role: "user",
				content: `${label}${i}`,
				createdAt: ctx.clock.now,
				planRunId: runId,
			})
			.run();
	}
	ctx.db
		.insert(llmCalls)
		.values({
			at: ctx.clock.now,
			userId,
			channelId: ctx.shop.channel.id,
			threadId,
			planRunId: runId,
			kind: "generate",
			provider: "albedo",
			model: "m",
			inputTokens: 5,
			outputTokens: 5,
			latencyMs: 1,
			ok: true,
		})
		.run();
	return { threadId, runId };
}

describe("POST /v1/channels/:slug/identify", () => {
	test("wrong secret → 401; the transport key doesn't work either", async () => {
		const ctx = setup();
		const { visitorToken } = await newVisitor(ctx);
		const body = { visitorToken, externalUserId: "acc-1" };
		expect((await identify(ctx, body, "sk_wrong")).status).toBe(401);
		expect((await identify(ctx, body, "transport-key")).status).toBe(401);
		// Another channel's secret doesn't open this one.
		expect((await identify(ctx, body, ctx.other.secretKey)).status).toBe(401);
	});

	test("unknown channel slug → 404", async () => {
		const ctx = setup();
		const response = await identify(
			ctx,
			{ visitorToken: "x", externalUserId: "acc-1" },
			ctx.shop.secretKey,
			"nope",
		);
		expect(response.status).toBe(404);
	});

	test("unknown visitor token, or one issued by another channel → 404", async () => {
		const ctx = setup();
		expect(
			(await identify(ctx, { visitorToken: "nope", externalUserId: "a" }))
				.status,
		).toBe(404);
		const foreign = await newVisitor(ctx, ctx.other.channel);
		expect(
			(
				await identify(ctx, {
					visitorToken: foreign.visitorToken,
					externalUserId: "a",
				})
			).status,
		).toBe(404);
	});

	test("no identified user yet → the anonymous user is promoted in place", async () => {
		const ctx = setup();
		const visitor = await newVisitor(ctx);
		const response = await identify(ctx, {
			visitorToken: visitor.visitorToken,
			externalUserId: "acc-1",
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			userId: visitor.userId,
			merged: false,
		});
		expect(
			ctx.db.select().from(users).where(eq(users.id, visitor.userId)).get(),
		).toMatchObject({ kind: "identified", externalUserId: "acc-1" });
	});

	test("existing identified user → merge: history (re-trimmed), usage, runs and tokens move; anonymous row is deleted; a block survives", async () => {
		const ctx = setup();
		const visitor = await newVisitor(ctx);
		const targetId = crypto.randomUUID();
		ctx.db
			.insert(users)
			.values({
				id: targetId,
				channelId: ctx.shop.channel.id,
				externalUserId: "acc-1",
				kind: "identified",
				createdAt: 1,
				lastSeenAt: 1,
			})
			.run();
		seedHistory(ctx, targetId, 8, "old");
		const anon = seedHistory(ctx, visitor.userId, 4, "new");
		ctx.db
			.update(users)
			.set({
				blockedAt: 5,
				blockedReason: "spam",
				blockedBy: "admin-1",
				lastIp: "203.0.113.7",
			})
			.where(eq(users.id, visitor.userId))
			.run();

		const response = await identify(ctx, {
			visitorToken: visitor.visitorToken,
			externalUserId: "acc-1",
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ userId: targetId, merged: true });

		expect(
			ctx.db.select().from(users).where(eq(users.id, visitor.userId)).get(),
		).toBeUndefined();
		const target = ctx.db
			.select()
			.from(users)
			.where(eq(users.id, targetId))
			.get();
		expect(target).toMatchObject({
			blockedAt: 5,
			blockedReason: "spam",
			blockedBy: "admin-1",
			lastSeenAt: ctx.clock.now,
			lastIp: "203.0.113.7",
		});

		const kept = ctx.db
			.select()
			.from(messages)
			.where(eq(messages.userId, targetId))
			.orderBy(messages.id)
			.all()
			.map((row) => row.content);
		// 12 messages total, only the newest 10 kept.
		expect(kept).toEqual([
			"old2",
			"old3",
			"old4",
			"old5",
			"old6",
			"old7",
			"new0",
			"new1",
			"new2",
			"new3",
		]);
		expect(
			ctx.db.select().from(threads).where(eq(threads.id, anon.threadId)).get()
				?.userId,
		).toBe(targetId);
		expect(
			ctx.db.select().from(planRuns).where(eq(planRuns.id, anon.runId)).get()
				?.userId,
		).toBe(targetId);
		const usage = ctx.db.select().from(llmCalls).all();
		expect(usage).toHaveLength(2);
		expect(usage.every((row) => row.userId === targetId)).toBe(true);
		expect(ctx.db.select().from(visitorTokens).get()?.userId).toBe(targetId);
	});

	test("repeating the same identify is idempotent", async () => {
		const ctx = setup();
		const visitor = await newVisitor(ctx);
		const body = {
			visitorToken: visitor.visitorToken,
			externalUserId: "acc-1",
		};
		const first = await (await identify(ctx, body)).json();
		const second = await identify(ctx, body);
		expect(second.status).toBe(200);
		expect(await second.json()).toEqual({
			userId: (first as { userId: string }).userId,
			merged: false,
		});
	});

	test("a token already bound to a different account → 409", async () => {
		const ctx = setup();
		const visitor = await newVisitor(ctx);
		await identify(ctx, {
			visitorToken: visitor.visitorToken,
			externalUserId: "acc-1",
		});
		const response = await identify(ctx, {
			visitorToken: visitor.visitorToken,
			externalUserId: "acc-2",
		});
		expect(response.status).toBe(409);
	});
});
