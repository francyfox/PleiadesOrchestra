import { describe, expect, test } from "bun:test";
import {
	call,
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

	test("a token sign-in opens a staff session with its level and closes setup", async () => {
		const cookie = await signedIn();
		const session = await (await call("/api/session", { cookie })).json();
		expect(session.setupRequired).toBe(false);
		expect(session.admin).toMatchObject({
			email: "first@example.com",
			name: "First",
			level: 0,
			isSuper: true,
		});
	});

	test("the password endpoints of the old staff login are gone", async () => {
		for (const path of ["/api/auth/login", "/api/auth/register"]) {
			const response = await call(path, {
				method: "POST",
				body: { email: "a@example.com", password: PASSWORD },
			});
			expect(response.status).toBe(404);
		}
	});

	test("wrong, malformed and empty tokens are all invalid_token (401)", async () => {
		await signedIn();
		const unknown = Buffer.alloc(32, 7).toString("base64url");
		for (const token of [
			unknown,
			"short",
			"",
			"!".repeat(43),
			`${unknown} x`,
		]) {
			const response = await call("/api/auth/token", {
				method: "POST",
				body: { token },
			});
			expect(response.status).toBe(401);
			expect(await response.json()).toEqual({ error: "invalid_token" });
			expect(response.headers.getSetCookie()).toHaveLength(0);
		}
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
		expect((await call("/api/channels")).status).toBe(401);
		expect((await call("/api/system")).status).toBe(401);
		expect((await call("/api/admins")).status).toBe(401);
		expect((await call("/api/user/me")).status).toBe(401);
	});
});
