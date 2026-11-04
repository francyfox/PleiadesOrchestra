import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { fakeOrchestrator, testApp } from "../../app.testing.ts";
import { schema } from "../database/database.ts";

async function setup(respond?: Parameters<typeof fakeOrchestrator>[0]) {
	const fake = fakeOrchestrator(
		respond ??
			((call) =>
				call.method === "GET"
					? Response.json({ items: [], total: 0 })
					: Response.json({})),
	);
	const t = testApp({ orchestrator: fake.client });
	const ann = await t.signedUser("ann@example.com");
	await t.signedUser("bob@example.com");
	const staff = await t.registerFirst();
	const rows = await t.db.query.user.findMany();
	const id = (email: string) =>
		rows.find((row) => row.email === email)?.id as string;
	return { t, calls: fake.calls, ann, staff, id };
}

describe("GET /api/accounts", () => {
	test("lists customers (not staff) with their channel counts", async () => {
		const owners: string[] = [];
		const subscriptions: Record<string, unknown>[] = [];
		const { t, staff, id } = await setup((call) =>
			call.path.includes("/channels")
				? Response.json({
						items: owners.map((ownerId) => ({ ownerId })),
						total: owners.length,
					})
				: call.path.includes("/subscriptions")
					? Response.json({ items: subscriptions })
					: Response.json({ items: [] }),
		);
		owners.push(
			id("ann@example.com"),
			id("ann@example.com"),
			id("bob@example.com"),
		);
		// ann: an old ended plan and the running one (the running one wins); bob: none.
		const plan = (status: string, currentPeriodEnd: number | null) => ({
			id: `sub_${status}`,
			customerId: "cus_1",
			customerEmail: null,
			plan: "Cloud",
			status,
			startedAt: 1,
			currentPeriodEnd,
			endedAt: null,
			accountId: id("ann@example.com"),
			polarUrl: null,
		});
		subscriptions.push(plan("ended", 500), plan("canceling", 400));
		const response = await t.call("/api/accounts", { cookie: staff });
		// the stub rows lack channel fields, so look at the shape the route builds
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body.total).toBe(2);
		expect(body.items.map((item: { email: string }) => item.email)).toEqual([
			"ann@example.com",
			"bob@example.com",
		]);
		expect(body.items[0]).toEqual({
			id: id("ann@example.com"),
			name: "ann@example.com",
			email: "ann@example.com",
			emailVerified: true,
			createdAt: expect.any(Number),
			lastActiveAt: null,
			banned: false,
			channelsCount: 2,
			balanceUsd: 0,
			plan: { status: "canceling", currentPeriodEnd: 400 },
		});
		expect(body.items[1]).toMatchObject({ channelsCount: 1, plan: null });
	});

	test("adds each balance, searches by email, sorts by any column, then pages", async () => {
		const balances: { accountId: string; balanceUsd: number }[] = [];
		const { t, staff, id } = await setup((call) =>
			call.path.includes("/balances")
				? Response.json({ items: balances })
				: Response.json({ items: [], total: 0 }),
		);
		await t.signedUser("carl@other.example");
		balances.push(
			{ accountId: id("ann@example.com"), balanceUsd: 5 },
			{ accountId: id("bob@example.com"), balanceUsd: 12.5 },
		);
		const get = async (search: string) =>
			(await (
				await t.call(`/api/accounts?${search}`, { cookie: staff })
			).json()) as {
				items: { email: string; balanceUsd: number }[];
				total: number;
			};
		const byBalance = await get("sort=balanceUsd&order=desc");
		expect(byBalance.items.map((u) => [u.email, u.balanceUsd])).toEqual([
			["bob@example.com", 12.5],
			["ann@example.com", 5],
			["carl@other.example", 0],
		]);
		const found = await get(
			"q=EXAMPLE.com&sort=email&order=desc&page=2&pageSize=1",
		);
		expect(found.total).toBe(2);
		expect(found.items.map((u) => u.email)).toEqual(["ann@example.com"]);
		// Default: oldest first, as before.
		expect((await get("")).items.map((u) => u.email)).toEqual([
			"ann@example.com",
			"bob@example.com",
			"carl@other.example",
		]);
	});

	test("a user gets 403 on every accounts route", async () => {
		const { t, ann, id } = await setup();
		const bob = id("bob@example.com");
		for (const [method, path] of [
			["GET", "/api/accounts"],
			["DELETE", `/api/accounts/${bob}`],
			["POST", `/api/accounts/${bob}/ban`],
			["POST", `/api/accounts/${bob}/unban`],
		] as const) {
			expect((await t.call(path, { method, cookie: ann })).status).toBe(403);
		}
		expect(await t.db.query.user.findMany()).toHaveLength(3);
	});
});

describe("DELETE /api/accounts/:id", () => {
	test("deletes the channels first, then the account and its sessions", async () => {
		const { t, calls, staff, id } = await setup();
		const bob = id("bob@example.com");
		const response = await t.call(`/api/accounts/${bob}`, {
			method: "DELETE",
			cookie: staff,
		});
		expect(response.status).toBe(200);
		expect(calls.at(-1)).toMatchObject({
			method: "DELETE",
			path: `/v1/admin/owners/${bob}/channels`,
			adminId: id("root@example.com"),
		});
		expect(
			await t.db.query.user.findFirst({ where: eq(schema.user.id, bob) }),
		).toBeUndefined();
		expect(
			(await t.db.query.session.findMany()).every((s) => s.userId !== bob),
		).toBe(true);
	});

	test("the account stays when the orchestrator cannot delete its channels", async () => {
		const { t, staff, id } = await setup(
			() => new Response("down", { status: 503 }),
		);
		const bob = id("bob@example.com");
		const response = await t.call(`/api/accounts/${bob}`, {
			method: "DELETE",
			cookie: staff,
		});
		expect(response.status).toBe(503);
		expect(
			await t.db.query.user.findFirst({ where: eq(schema.user.id, bob) }),
		).toBeDefined();
	});

	test("staff accounts and unknown ids are 404 and nothing is called", async () => {
		const { t, calls, staff, id } = await setup();
		const before = calls.length;
		for (const target of [id("root@example.com"), "nope"]) {
			const response = await t.call(`/api/accounts/${target}`, {
				method: "DELETE",
				cookie: staff,
			});
			expect(response.status).toBe(404);
			expect(await response.json()).toEqual({ error: "not_found" });
		}
		expect(calls).toHaveLength(before);
	});
});

describe("ban and unban", () => {
	test("a banned customer is signed out and cannot sign in until unbanned", async () => {
		const { t, staff, ann, id } = await setup();
		const target = id("ann@example.com");
		expect(
			(
				await t.call(`/api/accounts/${target}/ban`, {
					method: "POST",
					cookie: staff,
				})
			).status,
		).toBe(200);
		expect((await t.call("/api/user/me", { cookie: ann })).status).toBe(401);
		const list = await (
			await t.call("/api/accounts", { cookie: staff })
		).json();
		expect(list.items.find((i: { id: string }) => i.id === target).banned).toBe(
			true,
		);

		expect(
			(
				await t.call(`/api/accounts/${target}/unban`, {
					method: "POST",
					cookie: staff,
				})
			).status,
		).toBe(200);
		const list2 = await (
			await t.call("/api/accounts", { cookie: staff })
		).json();
		expect(
			list2.items.find((i: { id: string }) => i.id === target).banned,
		).toBe(false);
	});

	test("staff are not customers: 404", async () => {
		const { t, staff, id } = await setup();
		const response = await t.call(
			`/api/accounts/${id("root@example.com")}/ban`,
			{ method: "POST", cookie: staff },
		);
		expect(response.status).toBe(404);
	});
});

describe("staff corrections to a customer's billing", () => {
	const billing = {
		standing: { ok: true, until: null },
		subscription: null,
		balanceUsd: 20,
		orders: [],
		spend: [],
	};

	test("balance and plan go to the orchestrator as the signed-in admin", async () => {
		const { t, calls, staff, id } = await setup(() => Response.json(billing));
		const ann = id("ann@example.com");
		const balance = await t.call(`/api/accounts/${ann}/balance`, {
			method: "POST",
			body: { amountUsd: 20 },
			cookie: staff,
		});
		expect(balance.status).toBe(200);
		const plan = await t.call(`/api/accounts/${ann}/plan`, {
			method: "PUT",
			body: { days: 30 },
			cookie: staff,
		});
		expect(plan.status).toBe(200);
		await t.call(`/api/accounts/${ann}/plan`, {
			method: "PUT",
			body: { days: 0 },
			cookie: staff,
		});
		const writes = calls.filter((call) => call.method !== "GET");
		expect(
			writes.map(({ method, path, body }) => ({ method, path, body })),
		).toEqual([
			{
				method: "POST",
				path: `/v1/admin/accounts/${ann}/balance`,
				body: { amountUsd: 20 },
			},
			{
				method: "PUT",
				path: `/v1/admin/accounts/${ann}/plan`,
				body: { until: expect.any(Number) },
			},
			{
				method: "PUT",
				path: `/v1/admin/accounts/${ann}/plan`,
				body: { until: null },
			},
		]);
		const until = writes[1]?.body as { until: number };
		expect(until.until - Date.now()).toBeGreaterThan(29 * 86_400_000);
		expect(writes.every((call) => call.adminId)).toBe(true);
	});

	test("a staff id is 404", async () => {
		const { t, staff, id } = await setup();
		const response = await t.call(
			`/api/accounts/${id("root@example.com")}/balance`,
			{
				method: "POST",
				body: { amountUsd: 5 },
				cookie: staff,
			},
		);
		expect(response.status).toBe(404);
	});
});
