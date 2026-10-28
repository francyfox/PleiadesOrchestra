import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
	channels,
	llmCalls,
	messages,
	threads,
	visitors,
} from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { admin, DAY, json, NOW, setupAdminApp } from "../http/http.testing.ts";
import { upsertIdentifiedVisitor } from "../visitors/visitors.service.ts";

async function create(
	app: ReturnType<typeof setupAdminApp>["app"],
	slug: string,
	ownerId?: string,
) {
	const created = await json(
		await app.handle(
			admin("/channels", {
				method: "POST",
				body: {
					slug,
					name: slug,
					kind: "web",
					accessMode: "open",
					allowedOrigins: [],
					ownerId,
				},
			}),
		),
	);
	return created.channel as { id: string; ownerId: string | null };
}

/** A visitor with a thread, a message and an LLM call in `channelId`. */
function seedTraffic(
	db: Db,
	channelId: string,
	external: string,
	tokens: number,
) {
	const visitor = upsertIdentifiedVisitor(
		db,
		channelId,
		external,
		undefined,
		NOW,
	);
	db.insert(threads)
		.values({
			id: `t-${external}`,
			visitorId: visitor.id,
			channelId,
			createdAt: NOW,
		})
		.run();
	db.insert(messages)
		.values({
			threadId: `t-${external}`,
			visitorId: visitor.id,
			role: "user",
			content: "hi",
			createdAt: NOW,
		})
		.run();
	db.insert(llmCalls)
		.values({
			at: NOW - DAY,
			visitorId: visitor.id,
			channelId,
			kind: "generate",
			provider: "p",
			model: "m",
			inputTokens: tokens,
			outputTokens: 0,
			latencyMs: 1,
			ok: true,
			prompt: `[{"role":"user","content":"hi from ${external}"}]`,
			response: "hello",
		})
		.run();
}

describe("channel ownership", () => {
	test("create stores ownerId, list filters by it, staff channels have null", async () => {
		const { app } = setupAdminApp();
		const mine = await create(app, "mine", "acc-1");
		await create(app, "theirs", "acc-2");
		expect(mine.ownerId).toBe("acc-1");

		const list = await json(await app.handle(admin("/channels?ownerId=acc-1")));
		expect(list.items.map((c: { id: string }) => c.id)).toEqual([mine.id]);
		expect(list.total).toBe(1);

		const all = await json(await app.handle(admin("/channels")));
		expect(
			all.items.find((c: { slug: string }) => c.slug === "cli").ownerId,
		).toBeNull();
		expect(all.total).toBe(4);
	});

	test("stats and usage count only the owner's channels", async () => {
		const { app, db } = setupAdminApp();
		const mine = await create(app, "mine", "acc-1");
		const theirs = await create(app, "theirs", "acc-2");
		seedTraffic(db, mine.id, "a", 7);
		seedTraffic(db, theirs.id, "b", 100);
		seedTraffic(db, "ch_cli", "c", 1000);

		const stats = await json(await app.handle(admin("/stats?ownerId=acc-1")));
		expect(stats.visitors.total).toBe(1);
		expect(stats.usage.last7d.inputTokens).toBe(7);

		for (const groupBy of ["day", "visitor", "channel", "model"]) {
			const usage = await json(
				await app.handle(admin(`/usage?groupBy=${groupBy}&ownerId=acc-1`)),
			);
			const total = usage.rows.reduce(
				(sum: number, row: { inputTokens: number }) => sum + row.inputTokens,
				0,
			);
			expect(total).toBe(7);
		}
		const unscoped = await json(await app.handle(admin("/stats")));
		expect(unscoped.usage.last7d.inputTokens).toBe(1107);
	});

	test("deleting an owner's channels cascades but keeps llm_calls, cut loose and without visitor text", async () => {
		const { app, db } = setupAdminApp();
		const mine = await create(app, "mine", "acc-1");
		const second = await create(app, "second", "acc-1");
		const theirs = await create(app, "theirs", "acc-2");
		seedTraffic(db, mine.id, "a", 7);
		seedTraffic(db, second.id, "b", 5);
		seedTraffic(db, theirs.id, "c", 100);

		const deleted = await json(
			await app.handle(admin("/owners/acc-1/channels", { method: "DELETE" })),
		);
		expect(deleted).toEqual({ deleted: 2 });

		expect(
			db.select().from(channels).where(eq(channels.ownerId, "acc-1")).all(),
		).toEqual([]);
		expect(
			db
				.select()
				.from(visitors)
				.all()
				.map((v) => v.channelId),
		).toEqual([theirs.id]);
		expect(db.select().from(messages).all()).toHaveLength(1);
		const calls = db.select().from(llmCalls).all();
		expect(calls).toHaveLength(3);
		expect(calls.filter((c) => c.channelId === null)).toHaveLength(2);
		expect(calls.reduce((sum, c) => sum + (c.inputTokens ?? 0), 0)).toBe(112);
		expect(
			calls
				.filter((c) => c.channelId === null)
				.map((c) => c.prompt ?? c.response),
		).toEqual([null, null]);
		expect(calls.find((c) => c.channelId === theirs.id)?.prompt).toContain(
			"hi from c",
		);

		const again = await json(
			await app.handle(admin("/owners/acc-1/channels", { method: "DELETE" })),
		);
		expect(again).toEqual({ deleted: 0 });
	});
});
