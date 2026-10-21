import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { eq } from "drizzle-orm";
import { ORIGIN, testApp } from "../../app.testing.ts";
import { schema } from "../database/database.ts";
import { needsTouch } from "./accounts.service.ts";

const DAY = 86_400_000;

describe("levels on the routes", () => {
	test("a customer gets 403 on staff routes and staff-only data", async () => {
		const t = testApp();
		const cookie = await t.signedUser();
		for (const path of [
			"/api/admins",
			"/api/system",
			"/api/agents",
			"/api/intents",
			"/api/performance",
		]) {
			const response = await t.call(path, { cookie });
			expect(response.status).toBe(403);
			expect(await response.json()).toEqual({ error: "forbidden" });
		}
		const mutation = await t.call("/api/admins", {
			method: "POST",
			cookie,
			body: { email: "x@example.com", name: "x" },
		});
		expect(mutation.status).toBe(403);
	});

	test("a customer gets 403 on EVERY route except the account ones (walks the route table)", async () => {
		const t = testApp();
		const cookie = await t.signedUser();
		// Open to a signed-in customer on purpose (each has its own scoping tests).
		const open = [
			/^\/api\/session$/,
			/^\/api\/auth\//,
			/^\/api\/user\//,
			/^\/api\/channels(\/|$)/,
			/^\/api\/dashboard$/,
			// scoped to the user's channels: channels/owned-pages.test.ts
			/^\/api\/(visitors|requests|blocked-ips)(\/|$)/,
			// a user's own billing (staff get 403 inside; see billing.test.ts)
			/^\/api\/billing(\/|$)/,
			/^\/api\/live$/,
			// a WebSocket upgrade: covered by its own test below
			/^\/api\/system\/stream$/,
			// public on purpose (sign-in pages report too); its DSN check is tested in sentry-tunnel.test.ts
			/^\/api\/monitoring\/tunnel$/,
		];
		const routes = t.app.routes.filter(
			(route) =>
				route.path.startsWith("/api/") &&
				route.method !== "ALL" &&
				route.method !== "OPTIONS" &&
				!route.path.startsWith("/api/docs") &&
				!open.some((pattern) => pattern.test(route.path)),
		);
		expect(routes.length).toBeGreaterThan(25);
		let forbidden = 0;
		for (const { method, path, hooks } of routes) {
			const url = path.replace(/:[^/]+/g, "x");
			// Validation runs before the guard, so a body that fails it answers 422 (handler never runs). Try a schema-valid one first.
			let body: unknown = {};
			try {
				if (hooks?.body) body = Value.Create(hooks.body);
			} catch {
				// a pattern without a default cannot be generated
			}
			const response = await t.call(url, { method, cookie, body });
			// Never 2xx: the handler did not run for a customer.
			expect([method, path, [403, 422].includes(response.status)]).toEqual([
				method,
				path,
				true,
			]);
			if (response.status === 403) forbidden++;
		}
		expect(forbidden).toBeGreaterThan(routes.length - 8);
	});

	test("a customer cannot open the staff host-meter WebSocket", async () => {
		const t = testApp();
		const cookie = await t.signedUser();
		t.app.listen(0);
		try {
			const response = await fetch(
				`http://localhost:${t.app.server?.port}/api/system/stream`,
				{
					headers: {
						cookie,
						origin: ORIGIN,
						connection: "Upgrade",
						upgrade: "websocket",
						"sec-websocket-version": "13",
						"sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
					},
				},
			);
			expect(response.status).toBe(403);
		} finally {
			await t.app.stop(true);
		}
	});

	test("a customer may call /api/session and /api/user/me", async () => {
		const t = testApp();
		const cookie = await t.signedUser();
		expect((await t.call("/api/user/me", { cookie })).status).toBe(200);
		const session = await (await t.call("/api/session", { cookie })).json();
		expect(session.admin).toMatchObject({ level: 200, isSuper: false });
	});

	test("a customer's token attempt is invalid_token", async () => {
		const t = testApp();
		await t.signedUser();
		const response = await t.call("/api/auth/token", {
			method: "POST",
			body: { token: Buffer.alloc(32, 3).toString("base64url") },
		});
		expect(response.status).toBe(401);
	});
});

describe("last_active_at", () => {
	test("needsTouch: unset or a day old", () => {
		const now = 10 * DAY;
		expect(needsTouch(null, now)).toBe(true);
		expect(needsTouch(new Date(now - DAY), now)).toBe(true);
		expect(needsTouch(new Date(now - DAY + 1), now)).toBe(false);
	});

	test("an authenticated request sets it once and not again within a day", async () => {
		const t = testApp();
		const cookie = await t.registerFirst();
		const read = async () =>
			(await t.db.query.user.findFirst())?.lastActiveAt?.getTime() ?? null;
		await t.call("/api/admins", { cookie });
		const first = await read();
		expect(first).toBeNumber();

		// Within a day: untouched, even though requests keep coming.
		const recent = Date.now() - 3_600_000;
		await t.db.update(schema.user).set({ lastActiveAt: new Date(recent) });
		await t.call("/api/admins", { cookie });
		await t.call("/api/session", { cookie });
		expect(await read()).toBe(recent);

		// A day old: refreshed.
		await t.db
			.update(schema.user)
			.set({ lastActiveAt: new Date(Date.now() - 2 * DAY) });
		await t.call("/api/session", { cookie });
		expect(await read()).toBeGreaterThan(Date.now() - 60_000);
	});

	test("a customer's /session and /user/me count as activity", async () => {
		const t = testApp();
		const cookie = await t.signedUser();
		const row = () =>
			t.db.query.user.findFirst({
				where: eq(schema.user.email, "user@example.com"),
			});
		// Sign-in itself doesn't read the session; the first call does.
		await t.call("/api/user/me", { cookie });
		expect((await row())?.lastActiveAt).toBeInstanceOf(Date);
	});
});
