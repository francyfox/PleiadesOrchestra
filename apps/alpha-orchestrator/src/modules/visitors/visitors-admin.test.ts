import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
	channels,
	llmCalls,
	messages,
	visitors,
} from "../database/database.schema.ts";
import {
	admin,
	DAY,
	json,
	NOW,
	seedLlmCall,
	setupAdminApp,
} from "../http/http.testing.ts";
import { finishPlanRun, startPlanRun } from "../plan-runs/plan-runs.service.ts";
import { resolveThreadId } from "../threads/threads.service.ts";
import { upsertIdentifiedVisitor } from "./visitors.service.ts";
import { decodeCursor, encodeCursor } from "./visitors-list.service.ts";

describe("admin visitors", () => {
	test("ownerId scopes the list, the detail and bulk actions to the owner's channels", async () => {
		const { app, db } = setupAdminApp();
		db.update(channels)
			.set({ ownerId: "ann" })
			.where(eq(channels.id, "ch_cli"))
			.run();
		const mine = upsertIdentifiedVisitor(db, "ch_cli", "1", "Mine", NOW);
		const theirs = upsertIdentifiedVisitor(
			db,
			"ch_telegram",
			"2",
			"Theirs",
			NOW,
		);

		const list = await json(await app.handle(admin("/visitors?ownerId=ann")));
		expect(list.items.map((v: { id: string }) => v.id)).toEqual([mine.id]);
		expect(list.total).toBe(1);

		expect(
			(await app.handle(admin(`/visitors/${mine.id}?ownerId=ann`))).status,
		).toBe(200);
		expect(
			(await app.handle(admin(`/visitors/${theirs.id}?ownerId=ann`))).status,
		).toBe(404);

		const bulk = await json(
			await app.handle(
				admin("/visitors/bulk", {
					method: "POST",
					body: { ids: [mine.id, theirs.id], action: "block", ownerId: "ann" },
				}),
			),
		);
		expect(bulk.updated).toBe(1);
	});

	test("list: status, usage totals (calls without usage counted separately), filters, total", async () => {
		const { app, db } = setupAdminApp();
		const pending = upsertIdentifiedVisitor(
			db,
			"ch_telegram",
			"1",
			"Pending",
			NOW - 3,
		);
		const cliVisitor = upsertIdentifiedVisitor(
			db,
			"ch_cli",
			"2",
			"Cli",
			NOW - 2,
		);
		seedLlmCall(db, pending.id, NOW - 10, 100, 20);
		seedLlmCall(db, pending.id, NOW - 9, null, null);

		const all = await json(await app.handle(admin("/visitors")));
		expect(all.total).toBe(2);
		expect(all.nextCursor).toBeNull();
		// Default sort: lastSeenAt desc.
		expect(all.items.map((u: { id: string }) => u.id)).toEqual([
			cliVisitor.id,
			pending.id,
		]);
		expect(all.items[1]).toMatchObject({
			status: "pending",
			channel: { slug: "telegram", kind: "telegram" },
			usage: {
				inputTokens: 100,
				outputTokens: 20,
				calls: 2,
				callsWithoutUsage: 1,
			},
		});
		expect(all.items[0].status).toBe("allowed");

		const onlyPending = await json(
			await app.handle(admin("/visitors?status=pending")),
		);
		expect(onlyPending.items.map((u: { id: string }) => u.id)).toEqual([
			pending.id,
		]);

		const byTokens = await json(
			await app.handle(admin("/visitors?sort=tokens&order=desc")),
		);
		expect(byTokens.items[0].id).toBe(pending.id);

		const search = await json(await app.handle(admin("/visitors?q=Cli")));
		expect(search.total).toBe(1);
	});

	test("list and detail carry the generated name; search finds it; the old /users path is gone", async () => {
		const { app, db } = setupAdminApp();
		const v = upsertIdentifiedVisitor(db, "ch_cli", "1", "Ivan", NOW);

		const list = await json(await app.handle(admin("/visitors")));
		expect(list.items[0]).toMatchObject({
			id: v.id,
			name: v.name,
			displayName: "Ivan",
		});
		const found = await json(
			await app.handle(admin(`/visitors?q=${v.name.split("_")[2]}`)),
		);
		expect(found.total).toBe(1);
		const detail = await json(await app.handle(admin(`/visitors/${v.id}`)));
		expect(detail.visitor.name).toBe(v.name);

		expect((await app.handle(admin("/users"))).status).toBe(404);
		expect((await app.handle(admin(`/users/${v.id}`))).status).toBe(404);
	});

	test("list paginates with an opaque cursor", async () => {
		const { app, db } = setupAdminApp();
		for (let i = 0; i < 3; i++)
			upsertIdentifiedVisitor(db, "ch_cli", `u${i}`, undefined, NOW - i);
		const first = await json(await app.handle(admin("/visitors?limit=2")));
		expect(first.items).toHaveLength(2);
		expect(first.total).toBe(3);
		const second = await json(
			await app.handle(admin(`/visitors?limit=2&cursor=${first.nextCursor}`)),
		);
		expect(second.items).toHaveLength(1);
		expect(second.nextCursor).toBeNull();
	});

	test("whitelist / block / unblock record the admin id and flip the status", async () => {
		const { app, db } = setupAdminApp();
		const visitor = upsertIdentifiedVisitor(
			db,
			"ch_telegram",
			"1",
			undefined,
			NOW,
		);

		const whitelisted = await json(
			await app.handle(
				admin(`/visitors/${visitor.id}/whitelist`, { method: "POST" }),
			),
		);
		expect(whitelisted.visitor).toMatchObject({
			status: "allowed",
			whitelistedAt: NOW,
			whitelistedBy: "admin-1",
		});

		const blocked = await json(
			await app.handle(
				admin(`/visitors/${visitor.id}/block`, {
					method: "POST",
					body: { reason: "spam" },
				}),
			),
		);
		expect(blocked.visitor).toMatchObject({
			status: "blocked",
			blockedReason: "spam",
			blockedBy: "admin-1",
		});

		const unblocked = await json(
			await app.handle(
				admin(`/visitors/${visitor.id}/unblock`, { method: "POST" }),
			),
		);
		expect(unblocked.visitor.status).toBe("allowed");

		const unwhitelisted = await json(
			await app.handle(
				admin(`/visitors/${visitor.id}/unwhitelist`, { method: "POST" }),
			),
		);
		expect(unwhitelisted.visitor.status).toBe("pending");
	});

	test("block without a body works; unknown visitor → 404", async () => {
		const { app, db } = setupAdminApp();
		const visitor = upsertIdentifiedVisitor(db, "ch_cli", "1", undefined, NOW);
		const blocked = await json(
			await app.handle(
				admin(`/visitors/${visitor.id}/block`, { method: "POST" }),
			),
		);
		expect(blocked.visitor.blockedReason).toBeNull();
		expect(
			(await app.handle(admin("/visitors/nope/whitelist", { method: "POST" })))
				.status,
		).toBe(404);
	});

	test("bulk applies to existing ids only", async () => {
		const { app, db } = setupAdminApp();
		const a = upsertIdentifiedVisitor(db, "ch_telegram", "1", undefined, NOW);
		const b = upsertIdentifiedVisitor(db, "ch_telegram", "2", undefined, NOW);
		const result = await json(
			await app.handle(
				admin("/visitors/bulk", {
					method: "POST",
					body: { ids: [a.id, b.id, "missing"], action: "whitelist" },
				}),
			),
		);
		expect(result).toEqual({ updated: 2 });
	});

	test("detail: last messages with per-run usage, usage by day and model; delete messages", async () => {
		const { app, db } = setupAdminApp();
		const visitor = upsertIdentifiedVisitor(
			db,
			"ch_telegram",
			"1",
			undefined,
			NOW,
		);
		const thread = resolveThreadId(db, "ch_telegram", visitor.id, "chat", NOW);
		startPlanRun(db, {
			id: "run",
			visitorId: visitor.id,
			threadId: thread,
			goal: {},
			createdAt: NOW,
		});
		finishPlanRun(db, "run", { succeeded: true, durationMs: 5, events: [] });
		db.insert(messages)
			.values([
				{
					threadId: thread,
					visitorId: visitor.id,
					role: "user",
					content: "q",
					createdAt: NOW,
					planRunId: "run",
				},
				{
					threadId: thread,
					visitorId: visitor.id,
					role: "assistant",
					content: "a",
					createdAt: NOW,
					planRunId: "run",
				},
			])
			.run();
		db.insert(llmCalls)
			.values({
				at: NOW,
				visitorId: visitor.id,
				channelId: "ch_telegram",
				planRunId: "run",
				kind: "generate",
				provider: "albedo",
				model: "vikhr",
				inputTokens: 5,
				outputTokens: 6,
				latencyMs: 30,
				ok: true,
			})
			.run();
		seedLlmCall(db, visitor.id, NOW - 40 * DAY, 1, 1); // outside the 30-day window

		const detail = await json(
			await app.handle(admin(`/visitors/${visitor.id}`)),
		);
		expect(detail.visitor.id).toBe(visitor.id);
		expect(detail.messages).toEqual([
			expect.objectContaining({
				role: "user",
				content: "q",
				usage: null,
				planRunId: "run",
			}),
			expect.objectContaining({
				role: "assistant",
				usage: { inputTokens: 5, outputTokens: 6, latencyMs: 30 },
			}),
		]);
		expect(typeof detail.messages[0].id).toBe("string");
		expect(detail.usageByDay).toEqual([
			{
				day: "2026-09-24",
				inputTokens: 5,
				outputTokens: 6,
				calls: 1,
				callsWithoutUsage: 0,
			},
		]);
		expect(detail.usageByModel).toEqual([
			{
				model: "vikhr",
				kind: "generate",
				inputTokens: 6,
				outputTokens: 7,
				calls: 2,
				callsWithoutUsage: 0,
				avgLatencyMs: 20,
			},
		]);

		const deleted = await app.handle(
			admin(`/visitors/${visitor.id}/messages`, { method: "DELETE" }),
		);
		expect(deleted.status).toBe(204);
		expect(db.select().from(messages).all()).toEqual([]);
		// Usage stays.
		expect(db.select().from(llmCalls).all()).toHaveLength(2);
		expect((await app.handle(admin("/visitors/nope"))).status).toBe(404);
	});

	test("visitors list and detail expose the stored last ip (null when unknown)", async () => {
		const { app, db } = setupAdminApp();
		const seen = upsertIdentifiedVisitor(
			db,
			"ch_telegram",
			"1",
			undefined,
			NOW,
		);
		const unseen = upsertIdentifiedVisitor(
			db,
			"ch_telegram",
			"2",
			undefined,
			NOW,
		);
		db.update(visitors)
			.set({ lastIp: "203.0.113.7" })
			.where(eq(visitors.id, seen.id))
			.run();

		const list = await json(await app.handle(admin("/visitors")));
		const byId = new Map(
			list.items.map((visitor: { id: string; ip: string | null }) => [
				visitor.id,
				visitor.ip,
			]),
		);
		expect(byId.get(seen.id)).toBe("203.0.113.7");
		expect(byId.get(unseen.id)).toBeNull();

		const detail = await json(await app.handle(admin(`/visitors/${seen.id}`)));
		expect(detail.visitor.ip).toBe("203.0.113.7");
	});
});

describe("visitors cursor", () => {
	test("round-trips an offset and treats garbage as the first page", () => {
		expect(decodeCursor(encodeCursor(30))).toBe(30);
		expect(decodeCursor(undefined)).toBe(0);
		expect(decodeCursor("not-a-cursor")).toBe(0);
	});
});

describe("admin visitors list sorting", () => {
	test("usage totals are the same whichever column the list is sorted by", async () => {
		const { app, db } = setupAdminApp();
		const heavy = upsertIdentifiedVisitor(db, "ch_cli", "1", "Heavy", NOW - 5);
		const light = upsertIdentifiedVisitor(db, "ch_cli", "2", "Light", NOW - 1);
		upsertIdentifiedVisitor(db, "ch_cli", "3", "Idle", NOW - 3);
		seedLlmCall(db, heavy.id, NOW - 10, 500, 100);
		seedLlmCall(db, light.id, NOW - 10, 1, 1);

		const totals = async (sort: string) => {
			const body = await json(
				await app.handle(admin(`/visitors?sort=${sort}&limit=2`)),
			);
			return Object.fromEntries(
				body.items.map(
					(u: { displayName: string; usage: { inputTokens: number } }) => [
						u.displayName,
						u.usage.inputTokens,
					],
				),
			);
		};

		expect(await totals("lastSeenAt")).toEqual({ Light: 1, Idle: 0 });
		expect(await totals("createdAt")).toEqual({ Light: 1, Idle: 0 });
		expect(await totals("tokens")).toEqual({ Heavy: 500, Light: 1 });
	});
});
