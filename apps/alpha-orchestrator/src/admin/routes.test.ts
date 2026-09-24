import { describe, expect, test } from "bun:test";
import type { Agent, DecisionAgent } from "@repo/core";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import {
	ChannelDirectory,
	resolveThreadId,
	upsertIdentifiedUser,
} from "../db/identity.ts";
import { finishPlanRun, startPlanRun } from "../db/plan-trace.ts";
import { RunBinding } from "../db/run-binding.ts";
import { llmCalls, messages, users } from "../db/schema.ts";
import { createApp } from "../server.ts";
import { testDb } from "../test/db.ts";

const ADMIN_KEY = "admin-key";
const NOW = Date.UTC(2026, 8, 24, 12);
const DAY = 24 * 60 * 60 * 1000;

const agent: Agent = {
	async *handleMessageStream() {},
	async resetThread() {},
};
const decisionAgent: DecisionAgent = { decide: async () => ({}) };

function setup() {
	const db = testDb();
	const app = createApp({
		agent,
		decisionAgent,
		apiKey: "transport-key",
		adminApiKey: ADMIN_KEY,
		maxChunkChars: 100,
		db,
		channels: new ChannelDirectory(db),
		runs: new RunBinding(),
		ipHashSalt: "salt",
		now: () => NOW,
	});
	return { db, app };
}

function admin(
	path: string,
	init: {
		method?: string;
		body?: unknown;
		adminId?: string | null;
		key?: string;
	} = {},
): Request {
	const headers: Record<string, string> = {
		authorization: `Bearer ${init.key ?? ADMIN_KEY}`,
	};
	if (init.adminId !== null) headers["x-admin-id"] = init.adminId ?? "admin-1";
	if (init.body !== undefined) headers["content-type"] = "application/json";
	return new Request(`http://harness.local/v1/admin${path}`, {
		method: init.method ?? "GET",
		headers,
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});
}

// biome-ignore lint/suspicious/noExplicitAny: loosely-typed JSON bodies keep the assertions readable
async function json<T = any>(response: Response): Promise<T> {
	expect(response.status).toBeLessThan(300);
	return (await response.json()) as T;
}

function usage(
	db: Db,
	userId: string | null,
	at: number,
	input: number | null,
	output: number | null,
) {
	db.insert(llmCalls)
		.values({
			at,
			userId,
			channelId: "ch_telegram",
			kind: "generate",
			provider: "albedo",
			model: "vikhr",
			inputTokens: input,
			outputTokens: output,
			latencyMs: 10,
			ok: true,
		})
		.run();
}

describe("admin auth", () => {
	test("the transport key gets 401 on /v1/admin/*", async () => {
		const { app } = setup();
		const response = await app.handle(
			admin("/stats", { key: "transport-key" }),
		);
		expect(response.status).toBe(401);
	});

	test("mutations without X-Admin-Id → 400, reads don't need it", async () => {
		const { app, db } = setup();
		const user = upsertIdentifiedUser(db, "ch_telegram", "1", undefined, NOW);
		expect(
			(
				await app.handle(
					admin(`/users/${user.id}/whitelist`, {
						method: "POST",
						adminId: null,
					}),
				)
			).status,
		).toBe(400);
		expect((await app.handle(admin("/stats", { adminId: null }))).status).toBe(
			200,
		);
	});
});

describe("users", () => {
	test("list: status, usage totals (calls without usage counted separately), filters, total", async () => {
		const { app, db } = setup();
		const pending = upsertIdentifiedUser(
			db,
			"ch_telegram",
			"1",
			"Pending",
			NOW - 3,
		);
		const cliUser = upsertIdentifiedUser(db, "ch_cli", "2", "Cli", NOW - 2);
		usage(db, pending.id, NOW - 10, 100, 20);
		usage(db, pending.id, NOW - 9, null, null);

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
		const { app, db } = setup();
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
		const { app, db } = setup();
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
		const { app, db } = setup();
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
		const { app, db } = setup();
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
		const { app, db } = setup();
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
		usage(db, user.id, NOW - 40 * DAY, 1, 1); // outside the 30-day window

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
});

describe("usage and stats", () => {
	test("groupBy user labels deleted users; groupBy day buckets by UTC day", async () => {
		const { app, db } = setup();
		const user = upsertIdentifiedUser(db, "ch_telegram", "1", "Ivan", NOW);
		usage(db, user.id, NOW - DAY, 10, 1);
		usage(db, null, NOW, 5, null);

		const byUser = await json(await app.handle(admin("/usage?groupBy=user")));
		expect(byUser.rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: user.id,
					label: "Ivan",
					inputTokens: 10,
				}),
				expect.objectContaining({
					key: null,
					label: "(удалён)",
					callsWithoutUsage: 1,
				}),
			]),
		);

		const byDay = await json(await app.handle(admin("/usage?groupBy=day")));
		expect(byDay.rows.map((r: { key: string }) => r.key)).toEqual([
			"2026-09-23",
			"2026-09-24",
		]);

		const byChannel = await json(
			await app.handle(admin("/usage?groupBy=channel&channel=telegram")),
		);
		expect(byChannel.rows).toEqual([
			expect.objectContaining({ key: "telegram", calls: 2 }),
		]);
	});

	test("stats counts users by status and usage windows", async () => {
		const { app, db } = setup();
		upsertIdentifiedUser(db, "ch_telegram", "1", undefined, NOW);
		const blocked = upsertIdentifiedUser(db, "ch_cli", "2", undefined, NOW);
		db.update(users)
			.set({ blockedAt: NOW })
			.where(eq(users.id, blocked.id))
			.run();
		usage(db, null, NOW - 2 * DAY, 3, 3);

		const result = await json(await app.handle(admin("/stats")));
		expect(result.users).toEqual({
			total: 2,
			pending: 1,
			blocked: 1,
			anonymous: 0,
		});
		expect(result.usage.today.calls).toBe(0);
		expect(result.usage.last7d).toEqual({
			inputTokens: 3,
			outputTokens: 3,
			calls: 1,
			callsWithoutUsage: 0,
		});
	});
});

describe("GOAP", () => {
	test("runs/:id returns the run, its events (payload split out) and its model calls", async () => {
		const { app, db } = setup();
		const user = upsertIdentifiedUser(db, "ch_cli", "1", undefined, NOW);
		const thread = resolveThreadId(db, "ch_cli", user.id, "t", NOW);
		startPlanRun(db, {
			id: "r",
			userId: user.id,
			threadId: thread,
			goal: { replied: true },
			createdAt: NOW,
		});
		finishPlanRun(db, "r", {
			succeeded: true,
			durationMs: 9,
			events: [
				{
					type: "planned",
					attempt: 0,
					plan: [{ name: "generateReply", cost: 5 }],
					totalCost: 5,
					state: {},
					at: NOW,
				},
				{
					type: "finished",
					succeeded: true,
					attempts: 1,
					durationMs: 9,
					at: NOW,
				},
			],
		});

		const body = await json(await app.handle(admin("/runs/r")));
		expect(body.run).toMatchObject({
			id: "r",
			succeeded: true,
			goal: { replied: true },
			attempts: 1,
		});
		expect(body.events[0]).toEqual({
			seq: 0,
			type: "planned",
			attempt: 0,
			action: null,
			payload: {
				plan: [{ name: "generateReply", cost: 5 }],
				totalCost: 5,
				state: {},
			},
			at: NOW,
		});
		expect(body.llmCalls).toEqual([]);
		expect((await app.handle(admin("/runs/nope"))).status).toBe(404);
	});

	test("goap/actions exposes the catalog without execute", async () => {
		const { app } = setup();
		const body = await json(await app.handle(admin("/goap/actions")));
		expect(body).toEqual({
			actions: [
				{
					name: "generateReply",
					cost: 5,
					preconditions: {},
					effects: { replied: true },
				},
			],
		});
	});
});

describe("channels", () => {
	test("create returns the secret once, list never exposes it; duplicate slug → 409", async () => {
		const { app } = setup();
		const created = await json(
			await app.handle(
				admin("/channels", {
					method: "POST",
					body: {
						slug: "shop-foo",
						name: "Foo",
						kind: "web",
						accessMode: "open",
						allowedOrigins: ["https://foo.example"],
					},
				}),
			),
		);
		expect(created.secretKey).toStartWith("sk_");
		expect(created.channel).toMatchObject({
			slug: "shop-foo",
			kind: "web",
			allowedOrigins: ["https://foo.example"],
			disabledAt: null,
		});
		expect(created.channel.publishableKey).toStartWith("pk_");

		const list = await json(await app.handle(admin("/channels")));
		expect(list.items.map((c: { slug: string }) => c.slug)).toEqual(
			expect.arrayContaining(["telegram", "cli", "shop-foo"]),
		);
		expect(JSON.stringify(list)).not.toContain(created.secretKey);
		expect(JSON.stringify(list)).not.toContain("secretKeyHash");

		const duplicate = await app.handle(
			admin("/channels", {
				method: "POST",
				body: {
					slug: "shop-foo",
					name: "x",
					kind: "web",
					accessMode: "open",
					allowedOrigins: [],
				},
			}),
		);
		expect(duplicate.status).toBe(409);
	});

	test("patch disables a channel — its users are then denied on /v1/messages", async () => {
		const { app } = setup();
		const patched = await json(
			await app.handle(
				admin("/channels/ch_cli", {
					method: "PATCH",
					body: { disabled: true, accessMode: "whitelist" },
				}),
			),
		);
		expect(patched.channel).toMatchObject({
			accessMode: "whitelist",
			disabledAt: NOW,
		});

		const response = await app.handle(
			new Request("http://harness.local/v1/messages", {
				method: "POST",
				headers: {
					authorization: "Bearer transport-key",
					"content-type": "application/json",
				},
				body: JSON.stringify({ threadId: "t", userId: "u", text: "hi" }),
			}),
		);
		expect(response.status).toBe(403);
	});

	test("patch leaves omitted fields alone (no enum default-filling)", async () => {
		const { app } = setup();
		const patched = await json(
			await app.handle(
				admin("/channels/ch_cli", {
					method: "PATCH",
					body: { name: "Terminal" },
				}),
			),
		);
		expect(patched.channel).toMatchObject({
			name: "Terminal",
			accessMode: "open",
			disabledAt: null,
		});
	});

	test("rotate-keys issues a new key pair; unknown channel → 404", async () => {
		const { app } = setup();
		const created = await json(
			await app.handle(
				admin("/channels", {
					method: "POST",
					body: {
						slug: "shop",
						name: "S",
						kind: "web",
						accessMode: "open",
						allowedOrigins: [],
					},
				}),
			),
		);
		const rotated = await json(
			await app.handle(
				admin(`/channels/${created.channel.id}/rotate-keys`, {
					method: "POST",
				}),
			),
		);
		expect(rotated.secretKey).not.toBe(created.secretKey);
		expect(rotated.channel.publishableKey).not.toBe(
			created.channel.publishableKey,
		);
		expect(
			(
				await app.handle(
					admin("/channels/nope/rotate-keys", { method: "POST" }),
				)
			).status,
		).toBe(404);
	});
});

describe("blocked ips", () => {
	test("create hashes the ip (never stored raw), list, delete", async () => {
		const { app } = setup();
		const created = await json(
			await app.handle(
				admin("/blocked-ips", {
					method: "POST",
					body: { ip: "1.2.3.4", reason: "abuse", expiresInHours: 2 },
				}),
			),
		);
		expect(created.item).toMatchObject({
			reason: "abuse",
			channelId: null,
			createdAt: NOW,
			expiresAt: NOW + 2 * 60 * 60 * 1000,
		});
		expect(created.item.ipHash).not.toContain("1.2.3.4");

		const list = await json(await app.handle(admin("/blocked-ips")));
		expect(list.items).toHaveLength(1);
		expect(JSON.stringify(list)).not.toContain("1.2.3.4");

		const deleted = await app.handle(
			admin(`/blocked-ips/${created.item.id}`, { method: "DELETE" }),
		);
		expect(deleted.status).toBe(204);
		expect(
			(
				await app.handle(
					admin(`/blocked-ips/${created.item.id}`, { method: "DELETE" }),
				)
			).status,
		).toBe(404);
	});

	test("unknown channelId → 404; missing expiry → 422", async () => {
		const { app } = setup();
		expect(
			(
				await app.handle(
					admin("/blocked-ips", {
						method: "POST",
						body: {
							ip: "1.1.1.1",
							channelId: "nope",
							reason: "r",
							expiresInHours: 1,
						},
					}),
				)
			).status,
		).toBe(404);
		expect(
			(
				await app.handle(
					admin("/blocked-ips", {
						method: "POST",
						body: { ip: "1.1.1.1", reason: "r" },
					}),
				)
			).status,
		).toBe(422);
	});
});
