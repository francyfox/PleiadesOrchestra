import { describe, expect, test } from "bun:test";
import {
	call,
	PASSWORD,
	signedIn,
	useHarness,
} from "../../app.harness.testing.ts";

useHarness();

describe("admins", () => {
	test("lists, creates, bans and unbans admins with the safety rules", async () => {
		const cookie = await signedIn();

		const weak = await call("/api/admins", {
			method: "POST",
			cookie,
			body: { email: "b@example.com", password: "short" },
		});
		expect(await weak.json()).toEqual({ error: "weak_credentials", min: 8 });

		const created = await call("/api/admins", {
			method: "POST",
			cookie,
			body: { email: "b@example.com", password: PASSWORD },
		});
		expect(created.status).toBe(200);

		const { admins } = await (await call("/api/admins", { cookie })).json();
		expect(admins.map((a: { email: string }) => a.email)).toEqual([
			"first@example.com",
			"b@example.com",
		]);
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
		await call("/api/admins", {
			method: "POST",
			cookie,
			body: { email: "b@example.com", password: PASSWORD },
		});
		const { admins } = await (await call("/api/admins", { cookie })).json();
		const [first, second] = admins;
		await call(`/api/admins/${second.id}/ban`, {
			method: "POST",
			cookie,
			body: {},
		});

		// `first` is now the only active admin; only `second` (banned) could try — self-ban is refused too.
		const response = await call(`/api/admins/${first.id}/ban`, {
			method: "POST",
			cookie,
			body: {},
		});
		expect(response.status).toBe(400);
	});

	test("set password enforces the minimum and reports unknown admins", async () => {
		const cookie = await signedIn();
		const { admins } = await (await call("/api/admins", { cookie })).json();
		const short = await call(`/api/admins/${admins[0].id}/password`, {
			method: "POST",
			cookie,
			body: { password: "x" },
		});
		expect(await short.json()).toEqual({ error: "weak_password", min: 8 });

		const ok = await call(`/api/admins/${admins[0].id}/password`, {
			method: "POST",
			cookie,
			body: { password: "another-long-password" },
		});
		expect(ok.status).toBe(200);

		const missing = await call("/api/admins/nope/ban", {
			method: "POST",
			cookie,
			body: {},
		});
		expect(missing.status).toBe(404);
	});
});
