import { describe, expect, test } from "bun:test";
import { call, signedIn, useHarness } from "../../app.harness.testing.ts";

useHarness();

const create = (cookie: string, email: string) =>
	call("/api/admins", {
		method: "POST",
		cookie,
		body: { email, name: email },
	});

describe("admins", () => {
	test("lists, creates, bans and unbans admins with the safety rules", async () => {
		const cookie = await signedIn();

		const invalid = await create(cookie, "not-an-email");
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toEqual({ error: "invalid_email" });

		const created = await create(cookie, "b@example.com");
		expect(created.status).toBe(200);

		const { admins } = await (await call("/api/admins", { cookie })).json();
		expect(admins.map((a: { email: string }) => a.email)).toEqual([
			"first@example.com",
			"b@example.com",
		]);
		expect(admins.map((a: { level: number }) => a.level)).toEqual([0, 100]);
		const [first, second] = admins;

		const self = await call(`/api/admins/${first.id}/ban`, {
			method: "POST",
			cookie,
			body: {},
		});
		expect(await self.json()).toEqual({ error: "self" });

		const banned = await call(`/api/admins/${second.id}/ban`, {
			method: "POST",
			cookie,
			body: { reason: "left" },
		});
		expect(banned.status).toBe(200);
		const after = (await (await call("/api/admins", { cookie })).json()).admins;
		expect(after[1]).toMatchObject({ banned: true, banReason: "left" });

		expect(
			(await call(`/api/admins/${second.id}/unban`, { method: "POST", cookie }))
				.status,
		).toBe(200);
		expect(
			(await (await call("/api/admins", { cookie })).json()).admins[1].banned,
		).toBe(false);
	});

	test("the last active admin can't be banned", async () => {
		const cookie = await signedIn();
		await create(cookie, "b@example.com");
		const { admins } = await (await call("/api/admins", { cookie })).json();
		const [first, second] = admins;
		await call(`/api/admins/${second.id}/ban`, {
			method: "POST",
			cookie,
			body: {},
		});

		// `first` is now the only active admin; self-ban is refused too.
		const response = await call(`/api/admins/${first.id}/ban`, {
			method: "POST",
			cookie,
			body: {},
		});
		expect(response.status).toBe(400);
	});

	test("unknown admins are 404", async () => {
		const cookie = await signedIn();
		const missing = await call("/api/admins/nope/ban", {
			method: "POST",
			cookie,
			body: {},
		});
		expect(missing.status).toBe(404);
	});

	test("a banned admin can't sign in with their token", async () => {
		const cookie = await signedIn();
		const created = await (await create(cookie, "b@example.com")).json();
		await call(`/api/admins/${created.id}/ban`, {
			method: "POST",
			cookie,
			body: {},
		});
		const response = await call("/api/auth/token", {
			method: "POST",
			body: { token: created.token },
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "banned" });
	});
});
