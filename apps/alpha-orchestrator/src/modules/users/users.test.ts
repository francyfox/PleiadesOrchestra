import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { llmCalls, messages, users } from "../database/database.schema.ts";
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
import { upsertIdentifiedUser } from "./users.service.ts";
import { decodeCursor, encodeCursor } from "./users-list.service.ts";

describe("admin users", () => {
	test("list: status, usage totals (calls without usage counted separately), filters, total", async () => {
		const { app, db } = setupAdminApp();
		const pending = upsertIdentifiedUser(
			db,
			"ch_telegram",
			"1",
			"Pending",
			NOW - 3,
		);
		const cliUser = upsertIdentifiedUser(db, "ch_cli", "2", "Cli", NOW - 2);
		seedLlmCall(db, pending.id, NOW - 10, 100, 20);
		seedLlmCall(db, pending.id, NOW - 9, null, null);

		const all = await json(await app.handle(admin("/users")));
		expect(all.total).toBe(2);
		expect(all.nextCursor).toBeNull();
		// Default sort: lastSeenAt desc.
		expect(all.items.map((u: { id: string }) => u.id)).toEqual([
			cliUser.id,
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
			await app.handle(admin("/users?status=pending")),
		);
		expect(onlyPending.items.map((u: { id: string }) => u.id)).toEqual([
			pending.id,
		]);

		const byTokens = await json(
			await app.handle(admin("/users?sort=tokens&order=desc")),
		);
		expect(byTokens.items[0].id).toBe(pending.id);

		const search = await json(await app.handle(admin("/users?q=Cli")));
		expect(search.total).toBe(1);
	});

	test("list paginates with an opaque cursor", async () => {
		const { app, db } = setupAdminApp();
		for (let i = 0; i < 3; i++)
			upsertIdentifiedUser(db, "ch_cli", `u${i}`, undefined, NOW - i);
		const first = await json(await app.handle(admin("/users?limit=2")));
		expect(first.items).toHaveLength(2);
		expect(first.total).toBe(3);
		const second = await json(
			await app.handle(admin(`/users?limit=2&cursor=${first.nextCursor}`)),
		);
		expect(second.items).toHaveLength(1);
		expect(second.nextCursor).toBeNull();
	});

	test("whitelist / block / unblock record the admin id and flip the status", async () => {
		const { app, db } = setupAdminApp();
		const user = upsertIdentifiedUser(db, "ch_telegram", "1", undefined, NOW);

		const whitelisted = await json(
			await app.handle(
				admin(`/users/${user.id}/whitelist`, { method: "POST" }),
			),
		);
		expect(whitelisted.user).toMatchObject({
			status: "allowed",
			whitelistedAt: NOW,
			whitelistedBy: "admin-1",
		});

		const blocked = await json(
			await app.handle(
				admin(`/users/${user.id}/block`, {
					method: "POST",
					body: { reason: "spam" },
				}),
			),
		);
		expect(blocked.user).toMatchObject({
			status: "blocked",
			blockedReason: "spam",
			blockedBy: "admin-1",
		});

		const unblocked = await json(
			await app.handle(admin(`/users/${user.id}/unblock`, { method: "POST" })),
		);
		expect(unblocked.user.status).toBe("allowed");

		const unwhitelisted = await json(
			await app.handle(
				admin(`/users/${user.id}/unwhitelist`, { method: "POST" }),
			),
		);
		expect(unwhitelisted.user.status).toBe("pending");
	});

	test("block without a body works; unknown user → 404", async () => {
		const { app, db } = setupAdminApp();
		const user = upsertIdentifiedUser(db, "ch_cli", "1", undefined, NOW);
		const blocked = await json(
			await app.handle(admin(`/users/${user.id}/block`, { method: "POST" })),
		);
		expect(blocked.user.blockedReason).toBeNull();
		expect(
			(await app.handle(admin("/users/nope/whitelist", { method: "POST" })))
				.status,
		).toBe(404);
	});

	test("bulk applies to existing ids only", async () => {
		const { app, db } = setupAdminApp();
		const a = upsertIdentifiedUser(db, "ch_telegram", "1", undefined, NOW);
		const b = upsertIdentifiedUser(db, "ch_telegram", "2", undefined, NOW);
		const result = await json(
			await app.handle(
				admin("/users/bulk", {
					method: "POST",
					body: { ids: [a.id, b.id, "missing"], action: "whitelist" },
				}),
			),
		);
		expect(result).toEqual({ updated: 2 });
	});

	test("detail: last messages with per-run usage, usage by day and model; delete messages", async () => {
		const { app, db } = setupAdminApp();
		const user = upsertIdentifiedUser(db, "ch_telegram", "1", undefined, NOW);
		const thread = resolveThreadId(db, "ch_telegram", user.id, "chat", NOW);
		startPlanRun(db, {
			id: "run",
			userId: user.id,
			threadId: thread,
			goal: {},
			createdAt: NOW,
		});
		finishPlanRun(db, "run", { succeeded: true, durationMs: 5, events: [] });
		db.insert(messages)
			.values([
				{
					threadId: thread,
					userId: user.id,
					role: "user",
					content: "q",
					createdAt: NOW,
					planRunId: "run",
				},
				{
					threadId: thread,
					userId: user.id,
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
				userId: user.id,
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
		seedLlmCall(db, user.id, NOW - 40 * DAY, 1, 1); // outside the 30-day window

		const detail = await json(await app.handle(admin(`/users/${user.id}`)));
		expect(detail.user.id).toBe(user.id);
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
			admin(`/users/${user.id}/messages`, { method: "DELETE" }),
		);
		expect(deleted.status).toBe(204);
		expect(db.select().from(messages).all()).toEqual([]);
		// Usage stays.
		expect(db.select().from(llmCalls).all()).toHaveLength(2);
		expect((await app.handle(admin("/users/nope"))).status).toBe(404);
	});

	test("users list and detail expose the stored last ip (null when unknown)", async () => {
		const { app, db } = setupAdminApp();
		const seen = upsertIdentifiedUser(db, "ch_telegram", "1", undefined, NOW);
		const unseen = upsertIdentifiedUser(db, "ch_telegram", "2", undefined, NOW);
		db.update(users)
			.set({ lastIp: "203.0.113.7" })
			.where(eq(users.id, seen.id))
			.run();

		const list = await json(await app.handle(admin("/users")));
		const byId = new Map(
			list.items.map((user: { id: string; ip: string | null }) => [
				user.id,
				user.ip,
			]),
		);
		expect(byId.get(seen.id)).toBe("203.0.113.7");
		expect(byId.get(unseen.id)).toBeNull();

		const detail = await json(await app.handle(admin(`/users/${seen.id}`)));
		expect(detail.user.ip).toBe("203.0.113.7");
	});
});

describe("users cursor", () => {
	test("round-trips an offset and treats garbage as the first page", () => {
		expect(decodeCursor(encodeCursor(30))).toBe(30);
		expect(decodeCursor(undefined)).toBe(0);
		expect(decodeCursor("not-a-cursor")).toBe(0);
	});
});

describe("admin users list sorting", () => {
	test("usage totals are the same whichever column the list is sorted by", async () => {
		const { app, db } = setupAdminApp();
		const heavy = upsertIdentifiedUser(db, "ch_cli", "1", "Heavy", NOW - 5);
		const light = upsertIdentifiedUser(db, "ch_cli", "2", "Light", NOW - 1);
		upsertIdentifiedUser(db, "ch_cli", "3", "Idle", NOW - 3);
		seedLlmCall(db, heavy.id, NOW - 10, 500, 100);
		seedLlmCall(db, light.id, NOW - 10, 1, 1);

		const totals = async (sort: string) => {
			const body = await json(
				await app.handle(admin(`/users?sort=${sort}&limit=2`)),
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
