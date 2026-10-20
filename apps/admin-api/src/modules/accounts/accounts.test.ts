import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { ORIGIN, PASSWORD, testApp } from "../../app.testing.ts";
import { schema } from "../database/database.ts";

const EMAIL = "user@example.com";
const post = (t: ReturnType<typeof testApp>, path: string, body: unknown) =>
	t.call(path, { method: "POST", body });
const tokenOf = (link: string) => new URL(link).searchParams.get("token") ?? "";

describe("POST /api/user/register", () => {
	test("creates an unverified customer and mails a verification link", async () => {
		const t = testApp();
		const response = await post(t, "/api/user/register", {
			email: EMAIL,
			password: PASSWORD,
			locale: "ru",
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		const [mail] = t.mailer.sent;
		expect(mail?.to).toBe(EMAIL);
		expect(mail?.link).toStartWith(
			"http://localhost:3002/api/user/verify?token=",
		);
		expect(mail?.subject).toBe("Подтвердите email");
		const row = await t.db.query.user.findFirst();
		expect(row).toMatchObject({
			level: 200,
			emailVerified: false,
			locale: "ru",
		});
	});

	test("a short password is weak_credentials with the minimum", async () => {
		const t = testApp();
		const response = await post(t, "/api/user/register", {
			email: EMAIL,
			password: "short",
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "weak_credentials",
			min: 12,
		});
		expect(t.mailer.sent).toHaveLength(0);
	});

	test("a taken email looks like success but changes nothing", async () => {
		const t = testApp();
		await post(t, "/api/user/register", { email: EMAIL, password: PASSWORD });
		const again = await post(t, "/api/user/register", {
			email: EMAIL,
			password: "another-long-password",
		});
		expect(await again.json()).toEqual({ ok: true });
		expect(t.db.$client.query("select count(*) c from user").get()).toEqual({
			c: 1,
		});
		// The first password still stands once the address is verified.
		const link = t.mailer.sent[0]?.link ?? "";
		await t.app.handle(new Request(link.replace(ORIGIN, "http://localhost")));
		expect(
			(await post(t, "/api/user/login", { email: EMAIL, password: PASSWORD }))
				.status,
		).toBe(200);
	});

	test("a staff email can't become a customer account", async () => {
		const t = testApp();
		await t.registerFirst("root@example.com");
		await post(t, "/api/user/register", {
			email: "root@example.com",
			password: PASSWORD,
		});
		const rows = await t.db.query.user.findMany();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.level).toBe(0);
	});

	test("an unknown locale is rejected by the schema", async () => {
		const t = testApp();
		const response = await post(t, "/api/user/register", {
			email: EMAIL,
			password: PASSWORD,
			locale: "xx",
		});
		expect(response.status).toBe(422);
	});

	test("level can't be chosen in the body: the extra field is dropped", async () => {
		const t = testApp();
		await post(t, "/api/user/register", {
			email: EMAIL,
			password: PASSWORD,
			level: 0,
		});
		expect((await t.db.query.user.findFirst())?.level).toBe(200);
	});
});

describe("email verification and login", () => {
	test("an unverified account can't sign in (403) until the link is opened", async () => {
		const t = testApp();
		await post(t, "/api/user/register", { email: EMAIL, password: PASSWORD });
		const blocked = await post(t, "/api/user/login", {
			email: EMAIL,
			password: PASSWORD,
		});
		expect(blocked.status).toBe(403);
		expect(await blocked.json()).toEqual({ error: "email_not_verified" });
		// The UI says "we sent the email again": a fresh link, the first may have expired.
		expect(t.mailer.sent.map((mail) => mail.to)).toEqual([EMAIL, EMAIL]);

		const link = t.mailer.sent[0]?.link ?? "";
		const verify = await t.app.handle(
			new Request(link.replace(ORIGIN, "http://localhost")),
		);
		expect(verify.status).toBe(302);
		expect(verify.headers.get("location")).toBe(
			"http://localhost:3002/user/login?verified=1",
		);

		const ok = await post(t, "/api/user/login", {
			email: EMAIL,
			password: PASSWORD,
		});
		expect(ok.status).toBe(200);
		const session = await (
			await t.call("/api/session", { cookie: t.cookieOf(ok) })
		).json();
		expect(session.admin).toMatchObject({
			email: EMAIL,
			level: 200,
			isSuper: false,
		});
	});

	test("a bad verification token redirects with verified=0", async () => {
		const t = testApp();
		const response = await t.call("/api/user/verify?token=nope");
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"http://localhost:3002/user/login?verified=0",
		);
	});

	test("wrong password and unknown email look the same", async () => {
		const t = testApp();
		await t.signedUser(EMAIL);
		for (const body of [
			{ email: EMAIL, password: "wrong-password-1" },
			{ email: "nobody@example.com", password: PASSWORD },
		]) {
			const response = await post(t, "/api/user/login", body);
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: "invalid_credentials" });
		}
	});

	test("missing fields are missing_credentials", async () => {
		const response = await post(testApp(), "/api/user/login", {
			email: "",
			password: "",
		});
		expect(await response.json()).toEqual({ error: "missing_credentials" });
	});

	test("staff can't use the password login, even with a credential row left over", async () => {
		const t = testApp();
		await t.registerFirst("root@example.com");
		const root = await t.db.query.user.findFirst();
		await t.db.insert(schema.account).values({
			id: "legacy",
			accountId: root?.id ?? "",
			providerId: "credential",
			userId: root?.id ?? "",
			password: "irrelevant",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		const response = await post(t, "/api/user/login", {
			email: "root@example.com",
			password: PASSWORD,
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "invalid_credentials" });
	});
});

describe("password reset", () => {
	async function forgot(t: ReturnType<typeof testApp>) {
		await t.signedUser(EMAIL);
		t.mailer.sent.length = 0;
		await post(t, "/api/user/forgot", { email: EMAIL });
		return tokenOf(t.mailer.sent[0]?.link ?? "");
	}

	test("forgot mails a reset link; reset sets the new password and drops sessions", async () => {
		const t = testApp();
		const oldCookie = await t.signedUser(EMAIL);
		t.mailer.sent.length = 0;
		const response = await post(t, "/api/user/forgot", { email: EMAIL });
		expect(await response.json()).toEqual({ ok: true });
		const mail = t.mailer.sent[0];
		expect(mail?.link).toStartWith("http://localhost:3002/user/reset?token=");
		expect(mail?.subject).toBe("Reset your password");

		const reset = await post(t, "/api/user/reset", {
			token: tokenOf(mail?.link ?? ""),
			password: "brand-new-password",
		});
		expect(reset.status).toBe(200);
		expect(
			(await post(t, "/api/user/login", { email: EMAIL, password: PASSWORD }))
				.status,
		).toBe(400);
		expect(
			(
				await post(t, "/api/user/login", {
					email: EMAIL,
					password: "brand-new-password",
				})
			).status,
		).toBe(200);
		const old = await (
			await t.call("/api/session", { cookie: oldCookie })
		).json();
		expect(old.admin).toBeNull();
	});

	test("forgot answers ok for an unknown email and sends nothing", async () => {
		const t = testApp();
		const response = await post(t, "/api/user/forgot", {
			email: "nobody@example.com",
		});
		expect(await response.json()).toEqual({ ok: true });
		expect(t.mailer.sent).toHaveLength(0);
	});

	test("forgot sends no mail for a staff account", async () => {
		const t = testApp();
		await t.registerFirst("root@example.com");
		await post(t, "/api/user/forgot", { email: "root@example.com" });
		expect(t.mailer.sent).toHaveLength(0);
	});

	test("a token works once; the second use is invalid_token", async () => {
		const t = testApp();
		const token = await forgot(t);
		expect(
			(
				await post(t, "/api/user/reset", {
					token,
					password: "brand-new-password",
				})
			).status,
		).toBe(200);
		const again = await post(t, "/api/user/reset", {
			token,
			password: "yet-another-password",
		});
		expect(again.status).toBe(400);
		expect(await again.json()).toEqual({ error: "invalid_token" });
	});

	test("an expired token is invalid_token", async () => {
		const t = testApp();
		const token = await forgot(t);
		await t.db
			.update(schema.verification)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(schema.verification.identifier, `reset-password:${token}`));
		const response = await post(t, "/api/user/reset", {
			token,
			password: "brand-new-password",
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "invalid_token" });
	});

	test("an unknown token is invalid_token; a weak password is checked first", async () => {
		const t = testApp();
		const unknown = await post(t, "/api/user/reset", {
			token: "x",
			password: "brand-new-password",
		});
		expect(await unknown.json()).toEqual({ error: "invalid_token" });
		const weak = await post(t, "/api/user/reset", {
			token: "x",
			password: "short",
		});
		expect(await weak.json()).toEqual({ error: "weak_password", min: 12 });
	});
});

describe("GET /api/user/me", () => {
	test("a customer sees their own account; no session is 401", async () => {
		const t = testApp();
		const cookie = await t.signedUser(EMAIL);
		const me = await (await t.call("/api/user/me", { cookie })).json();
		expect(me).toMatchObject({ email: EMAIL, level: 200 });
		expect((await t.call("/api/user/me")).status).toBe(401);
	});
});
