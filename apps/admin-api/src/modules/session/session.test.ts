import { describe, expect, test } from "bun:test";
import {
	call,
	cookieOf,
	PASSWORD,
	signedIn,
	useHarness,
} from "../../app.harness.testing.ts";

useHarness();

describe("session and auth", () => {
	test("a fresh install asks for setup and has no admin", async () => {
		const response = await call("/api/session");
		expect(await response.json()).toEqual({ setupRequired: true, admin: null });
	});

	test("register creates the first admin, signs them in and closes setup", async () => {
		const cookie = await signedIn();
		const session = await (await call("/api/session", { cookie })).json();
		expect(session.setupRequired).toBe(false);
		expect(session.admin).toMatchObject({
			email: "first@example.com",
			name: "First",
		});
	});

	test("registration is closed once an admin exists", async () => {
		await signedIn();
		const response = await call("/api/auth/register", {
			method: "POST",
			body: { email: "intruder@example.com", password: PASSWORD },
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "registration_closed" });
	});

	test("register rejects a short password with the minimum", async () => {
		const response = await call("/api/auth/register", {
			method: "POST",
			body: { email: "a@example.com", password: "short" },
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "weak_credentials",
			min: 8,
		});
	});

	test("login: missing fields, wrong password, then success with a session cookie", async () => {
		await signedIn();

		const missing = await call("/api/auth/login", {
			method: "POST",
			body: { email: "", password: "" },
		});
		expect(await missing.json()).toEqual({ error: "missing_credentials" });

		const wrong = await call("/api/auth/login", {
			method: "POST",
			body: { email: "first@example.com", password: "nope-nope-nope" },
		});
		expect(wrong.status).toBe(400);
		expect(await wrong.json()).toEqual({ error: "invalid_credentials" });

		const ok = await call("/api/auth/login", {
			method: "POST",
			body: { email: "first@example.com", password: PASSWORD },
		});
		expect(ok.status).toBe(200);
		const session = await (
			await call("/api/session", { cookie: cookieOf(ok) })
		).json();
		expect(session.admin?.email).toBe("first@example.com");
	});

	test("logout invalidates the session", async () => {
		const cookie = await signedIn();
		const out = await call("/api/auth/logout", { method: "POST", cookie });
		expect(out.status).toBe(204);
		expect(
			(await (await call("/api/session", { cookie })).json()).admin,
		).toBeNull();
	});

	test("guarded routes answer 401 without a session", async () => {
		expect((await call("/api/users")).status).toBe(401);
		expect((await call("/api/system")).status).toBe(401);
		expect((await call("/api/admins")).status).toBe(401);
	});
});
