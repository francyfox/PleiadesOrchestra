import { describe, expect, test } from "bun:test";
import {
	fakeOrchestrator,
	testApp,
	type UpstreamCall,
} from "../../app.testing.ts";
import { deleteAccount } from "../accounts/accounts.service.ts";
import { DAY_MS } from "../common/common.service.ts";
import { schema } from "../database/database.ts";
import type { AccountBilling } from "./billing.schema.ts";
import {
	createPolarClient,
	standingView,
	warnings,
} from "./billing.service.ts";

const NOW = 1_800_000_000_000;

const billing = (patch: Partial<AccountBilling> = {}): AccountBilling => ({
	standing: { ok: true, until: null },
	subscription: null,
	balanceUsd: 5,
	orders: [],
	spend: [],
	...patch,
});

describe("warnings / standingView", () => {
	test("balance: exactly 1 TR is fine, just under warns", () => {
		expect(warnings(billing({ balanceUsd: 1 }), NOW)).toEqual([]);
		expect(warnings(billing({ balanceUsd: 0.99 }), NOW)).toEqual([
			"low_balance",
		]);
		expect(warnings(billing({ balanceUsd: -2 }), NOW)).toEqual(["low_balance"]);
	});

	test("plan end: exactly 3 days warns, a millisecond more does not, no end never", () => {
		const ending = (until: number | null) =>
			warnings(billing({ standing: { ok: true, until } }), NOW);
		expect(ending(NOW + 3 * DAY_MS)).toEqual(["plan_ending"]);
		expect(ending(NOW + 3 * DAY_MS + 1)).toEqual([]);
		expect(ending(null)).toEqual([]);
	});

	test("the view flattens the standing and sets warn", () => {
		const paused = billing({
			standing: { ok: false, reason: "no_balance", since: 7 },
			balanceUsd: 0,
		});
		expect(standingView(paused, NOW)).toEqual({
			ok: false,
			reason: "no_balance",
			since: 7,
			until: null,
			balanceUsd: 0,
			warn: true,
		});
		expect(standingView(billing(), NOW)).toMatchObject({
			ok: true,
			warn: false,
		});
	});
});

const SUBSCRIPTION = {
	id: "sub_1",
	customerId: "cus_1",
	customerEmail: null,
	plan: "Cloud",
	status: "active",
	startedAt: 1,
	currentPeriodEnd: null,
	endedAt: null,
	accountId: "x",
	polarUrl: null,
};

/** An app with a scripted orchestrator and a Polar client over a recording fetch. */
function setup(
	opts: {
		billing?: (call: UpstreamCall) => unknown;
		polar?: (url: string, init: RequestInit) => Response;
		withPolar?: boolean;
	} = {},
) {
	const polarCalls: {
		url: string;
		method: string;
		body: unknown;
		auth: string | null;
	}[] = [];
	const orch = fakeOrchestrator((call) =>
		Response.json(opts.billing?.(call) ?? billing()),
	);
	const polar =
		opts.withPolar === false
			? undefined
			: createPolarClient({
					token: "tok",
					server: "sandbox",
					planProductId: "prod_plan",
					creditsProductId: "prod_credits",
					fetch: (async (url: string, init: RequestInit) => {
						polarCalls.push({
							url,
							method: init.method ?? "GET",
							body: init.body ? JSON.parse(String(init.body)) : undefined,
							auth: new Headers(init.headers).get("authorization"),
						});
						return (
							opts.polar?.(url, init) ??
							Response.json({
								url: "https://polar.test/c",
								customer_portal_url: "https://polar.test/p",
							})
						);
					}) as unknown as typeof fetch,
				});
	const clock = { now: Date.now() };
	const t = testApp({ orchestrator: orch.client, polar, now: () => clock.now });
	return { t, polarCalls, upstream: orch.calls, clock };
}

describe("checkout", () => {
	test("builds the Polar request per kind and returns the url", async () => {
		const { t, polarCalls } = setup();
		const cookie = await t.signedUser("buyer@example.com");
		const id = (await t.db.query.user.findFirst())?.id;

		const plan = await t.call("/api/billing/checkout", {
			method: "POST",
			cookie,
			body: { kind: "plan" },
		});
		expect(plan.status).toBe(200);
		expect(await plan.json()).toEqual({ url: "https://polar.test/c" });
		expect(polarCalls[0]).toEqual({
			url: "https://sandbox-api.polar.sh/v1/checkouts/",
			method: "POST",
			auth: "Bearer tok",
			body: {
				products: ["prod_plan"],
				external_customer_id: id,
				customer_email: "buyer@example.com",
				success_url: `${"http://localhost:3002"}/billing?checkout=success`,
			},
		});

		await t.call("/api/billing/checkout", {
			method: "POST",
			cookie,
			body: { kind: "credits", amountUsd: 20 },
		});
		expect(polarCalls[1]?.body).toMatchObject({
			products: ["prod_credits"],
			amount: 2000,
		});
	});

	test("no token or no product is 503 billing_unavailable; a Polar refusal is 502", async () => {
		const none = setup({ withPolar: false });
		const cookie = await none.t.signedUser();
		const body = { kind: "plan" };
		const off = await none.t.call("/api/billing/checkout", {
			method: "POST",
			cookie,
			body,
		});
		expect([off.status, await off.json()]).toEqual([
			503,
			{ error: "billing_unavailable" },
		]);
		expect(
			(await none.t.call("/api/billing/portal", { method: "POST", cookie }))
				.status,
		).toBe(503);

		const refused = setup({ polar: () => new Response("no", { status: 422 }) });
		const cookie2 = await refused.t.signedUser();
		const bad = await refused.t.call("/api/billing/checkout", {
			method: "POST",
			cookie: cookie2,
			body,
		});
		expect([bad.status, await bad.json()]).toEqual([
			502,
			{ error: "billing_failed" },
		]);
	});

	test("portal returns the customer portal url for the session's account", async () => {
		const { t, polarCalls } = setup();
		const cookie = await t.signedUser();
		const id = (await t.db.query.user.findFirst())?.id;
		const response = await t.call("/api/billing/portal", {
			method: "POST",
			cookie,
		});
		expect(await response.json()).toEqual({ url: "https://polar.test/p" });
		expect(polarCalls[0]?.body).toEqual({ external_customer_id: id });
	});
});

describe("who sees what", () => {
	test("a user reads own billing; staff are refused on the user routes but read a user's", async () => {
		const { t, upstream } = setup();
		const user = await t.signedUser();
		const id = (await t.db.query.user.findFirst())?.id;
		expect((await t.call("/api/billing", { cookie: user })).status).toBe(200);
		expect(upstream.at(-1)?.path).toBe(`/v1/admin/accounts/${id}/billing`);

		const staff = await t.registerFirst();
		for (const path of ["/api/billing", "/api/billing/standing"]) {
			expect((await t.call(path, { cookie: staff })).status).toBe(403);
		}
		expect(
			(
				await t.call("/api/billing/checkout", {
					method: "POST",
					cookie: staff,
					body: { kind: "plan" },
				})
			).status,
		).toBe(403);

		expect(
			(await t.call(`/api/accounts/${id}/billing`, { cookie: staff })).status,
		).toBe(200);
		expect(
			(await t.call("/api/accounts/nope/billing", { cookie: staff })).status,
		).toBe(404);
		expect(
			(await t.call(`/api/accounts/${id}/billing`, { cookie: user })).status,
		).toBe(403);
		expect((await t.call("/api/billing")).status).toBe(401);
	});
});

describe("warning mails", () => {
	test("sent once per period, again in the next one", async () => {
		const low = billing({ balanceUsd: 0.5 });
		const { t, clock } = setup({ billing: () => low });
		const cookie = await t.signedUser("warn@example.com");
		const warned = () =>
			t.mailer.sent.filter(
				(m) => m.to === "warn@example.com" && m.link.endsWith("/billing"),
			);

		const first = await t.call("/api/billing/standing", { cookie });
		expect(await first.json()).toMatchObject({ warn: true, balanceUsd: 0.5 });
		expect(warned()).toHaveLength(1);
		expect(warned()[0]?.subject).toBe("Your trenni are running low");

		clock.now += 10_000; // past the 5 s cache: fetched again, same period
		await t.call("/api/billing/standing", { cookie });
		expect(warned()).toHaveLength(1);

		clock.now += 40 * DAY_MS; // another month
		await t.call("/api/billing/standing", { cookie });
		expect(warned()).toHaveLength(2);
	});

	test("a plan ending soon mails once for that period end; a healthy account gets nothing", async () => {
		const until = Date.now() + DAY_MS;
		const { t } = setup({
			billing: () => billing({ standing: { ok: true, until } }),
		});
		const cookie = await t.signedUser("end@example.com");
		await t.call("/api/billing/standing", { cookie });
		expect(await t.db.select().from(schema.accountNotices)).toMatchObject([
			{ kind: "plan_ending", period: String(until) },
		]);
		expect(
			t.mailer.sent.filter((m) => m.subject === "Your plan ends soon"),
		).toHaveLength(1);

		const fine = setup();
		const cookie2 = await fine.t.signedUser("fine@example.com");
		await fine.t.call("/api/billing/standing", { cookie: cookie2 });
		expect(await fine.t.db.select().from(schema.accountNotices)).toEqual([]);
	});
});

describe("deleting an account cancels the plan", () => {
	const running = billing({
		subscription: SUBSCRIPTION as AccountBilling["subscription"],
	});

	test("revokes the running subscription, then deletes", async () => {
		const { t, polarCalls } = setup({ billing: () => running });
		await t.signedUser("gone@example.com");
		const id = (await t.db.query.user.findFirst())?.id ?? "";
		await deleteAccount(
			{
				db: t.db,
				orchestrator: t.orchestrator,
				polar: createPolarClient({
					token: "tok",
					server: "production",
					fetch: (async (url: string, init: RequestInit) => {
						polarCalls.push({
							url,
							method: init.method ?? "",
							body: undefined,
							auth: null,
						});
						return Response.json({});
					}) as unknown as typeof fetch,
				}),
			},
			id,
			"admin",
		);
		expect(polarCalls).toMatchObject([
			{ method: "DELETE", url: "https://api.polar.sh/v1/subscriptions/sub_1" },
		]);
		expect(await t.db.query.user.findMany()).toHaveLength(0);
	});

	test("a Polar failure keeps the account and its channels", async () => {
		const { t, upstream } = setup({
			billing: () => running,
			polar: () => new Response("x", { status: 500 }),
		});
		const cookie = await t.signedUser("stay@example.com");
		const id = (await t.db.query.user.findFirst())?.id;
		const response = await t.call("/api/user/me", {
			method: "DELETE",
			cookie,
			body: { confirmEmail: "stay@example.com" },
		});
		expect([response.status, await response.json()]).toEqual([
			502,
			{ error: "billing_failed" },
		]);
		expect(await t.db.query.user.findMany()).toHaveLength(1);
		expect(upstream.some((call) => call.method === "DELETE")).toBe(false);
		expect(id).toBeString();
	});

	test("an ended plan is not revoked", async () => {
		const ended = billing({
			subscription: {
				...SUBSCRIPTION,
				status: "ended",
			} as AccountBilling["subscription"],
		});
		const { t, polarCalls } = setup({ billing: () => ended });
		const cookie = await t.signedUser("old@example.com");
		await t.call("/api/user/me", {
			method: "DELETE",
			cookie,
			body: { confirmEmail: "old@example.com" },
		});
		expect(polarCalls).toEqual([]);
		expect(await t.db.query.user.findMany()).toHaveLength(0);
	});
});
