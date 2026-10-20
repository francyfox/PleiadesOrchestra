import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { fakeOrchestrator, ORIGIN, testApp } from "../../app.testing.ts";
import { schema } from "../database/database.ts";

const EMAIL = "user@example.com";

async function setup(respond?: Parameters<typeof fakeOrchestrator>[0]) {
	const fake = fakeOrchestrator(respond);
	const t = testApp({ orchestrator: fake.client });
	const cookie = await t.signedUser(EMAIL);
	const find = (email: string) =>
		t.db.query.user.findFirst({ where: eq(schema.user.email, email) });
	return { t, calls: fake.calls, cookie, find };
}

describe("GET /api/user/me", () => {
	test("returns lastActiveAt as epoch ms (null before any activity)", async () => {
		const { t, cookie } = await setup();
		const first = await (await t.call("/api/user/me", { cookie })).json();
		expect(first).toMatchObject({ email: EMAIL, level: 200 });
		// The first authenticated call stamps it after the session was read.
		const second = await (await t.call("/api/user/me", { cookie })).json();
		expect(second.lastActiveAt).toBeNumber();
	});
});

describe("PATCH /api/user/me", () => {
	test("changes the name; a blank name is invalid_name", async () => {
		const { t, cookie, find } = await setup();
		const ok = await t.call("/api/user/me", {
			method: "PATCH",
			cookie,
			body: { name: "  Ann  " },
		});
		expect(ok.status).toBe(200);
		expect((await ok.json()).name).toBe("Ann");
		expect((await find(EMAIL))?.name).toBe("Ann");

		const blank = await t.call("/api/user/me", {
			method: "PATCH",
			cookie,
			body: { name: "   " },
		});
		expect(blank.status).toBe(400);
		expect(await blank.json()).toEqual({ error: "invalid_name" });
	});

	test("staff cannot use the user settings routes", async () => {
		const { t } = await setup();
		const staff = await t.registerFirst();
		for (const [method, path, body] of [
			["PATCH", "/api/user/me", { name: "x" }],
			["POST", "/api/user/me/email", { email: "x@example.com" }],
			["DELETE", "/api/user/me", { confirmEmail: "root@example.com" }],
		] as const) {
			expect((await t.call(path, { method, cookie: staff, body })).status).toBe(
				403,
			);
		}
		expect(
			await t.db.query.user.findFirst({
				where: eq(schema.user.email, "root@example.com"),
			}),
		).toBeDefined();
	});
});

describe("POST /api/user/me/email", () => {
	test("mails the new address and changes the email only after the link is opened", async () => {
		const { t, cookie, find } = await setup();
		const sent = t.mailer.sent.length;
		const response = await t.call("/api/user/me/email", {
			method: "POST",
			cookie,
			body: { email: "New@Example.com" },
		});
		expect(await response.json()).toEqual({ ok: true });
		expect(t.mailer.sent).toHaveLength(sent + 1);
		const mail = t.mailer.sent.at(-1);
		expect(mail?.to).toBe("new@example.com");
		expect((await find(EMAIL))?.email).toBe(EMAIL);

		await t.app.handle(
			new Request((mail?.link ?? "").replace(ORIGIN, "http://localhost")),
		);
		expect(await find(EMAIL)).toBeUndefined();
		expect((await find("new@example.com"))?.emailVerified).toBe(true);
	});

	test("the same address, a malformed one: 400 codes, nothing mailed", async () => {
		const { t, cookie } = await setup();
		const sent = t.mailer.sent.length;
		const same = await t.call("/api/user/me/email", {
			method: "POST",
			cookie,
			body: { email: EMAIL.toUpperCase() },
		});
		expect(await same.json()).toEqual({ error: "same_email" });
		const bad = await t.call("/api/user/me/email", {
			method: "POST",
			cookie,
			body: { email: "nope" },
		});
		expect(await bad.json()).toEqual({ error: "invalid_email" });
		expect(t.mailer.sent).toHaveLength(sent);
	});

	test("an address that is taken looks like success, sends nothing and changes nothing", async () => {
		const { t, cookie, find } = await setup();
		await t.signedUser("taken@example.com");
		const sent = t.mailer.sent.length;
		const response = await t.call("/api/user/me/email", {
			method: "POST",
			cookie,
			body: { email: "taken@example.com" },
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(t.mailer.sent).toHaveLength(sent);
		expect(await find(EMAIL)).toBeDefined();
	});
});

describe("DELETE /api/user/me", () => {
	test("a wrong or empty confirmation is confirm_mismatch and deletes nothing", async () => {
		const { t, calls, cookie, find } = await setup();
		for (const confirmEmail of ["", "other@example.com", "  "]) {
			const response = await t.call("/api/user/me", {
				method: "DELETE",
				cookie,
				body: { confirmEmail },
			});
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: "confirm_mismatch" });
		}
		expect(calls).toHaveLength(0);
		expect(await find(EMAIL)).toBeDefined();
	});

	test("deletes the channels, the account and its sessions (confirmation ignores case and spaces)", async () => {
		const { t, calls, cookie, find } = await setup();
		const id = (await find(EMAIL))?.id;
		const response = await t.call("/api/user/me", {
			method: "DELETE",
			cookie,
			body: { confirmEmail: ` ${EMAIL.toUpperCase()} ` },
		});
		expect(response.status).toBe(200);
		expect(calls).toEqual([
			{
				method: "DELETE",
				path: `/v1/admin/owners/${id}/channels`,
				adminId: id as string,
				body: undefined,
			},
		]);
		expect(await find(EMAIL)).toBeUndefined();
		expect(await t.db.query.session.findMany()).toHaveLength(0);
		expect((await t.call("/api/user/me", { cookie })).status).toBe(401);
	});

	test("with the orchestrator down the account is kept", async () => {
		const { t, cookie, find } = await setup(
			() => new Response("down", { status: 503 }),
		);
		const response = await t.call("/api/user/me", {
			method: "DELETE",
			cookie,
			body: { confirmEmail: EMAIL },
		});
		expect(response.status).toBe(503);
		expect(await find(EMAIL)).toBeDefined();
		expect((await t.call("/api/user/me", { cookie })).status).toBe(200);
	});
});
