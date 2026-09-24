import { describe, expect, test } from "bun:test";
import { resolveAuthRedirect } from "./auth-redirect";

describe("resolveAuthRedirect", () => {
	test("with no admin yet, every page goes to /register", () => {
		for (const pathname of ["/", "/users", "/login", "/admins"]) {
			expect(
				resolveAuthRedirect({ pathname, hasAdmin: false, isLoggedIn: false }),
			).toBe("/register");
		}
	});

	test("with no admin yet, /register itself is served", () => {
		expect(
			resolveAuthRedirect({
				pathname: "/register",
				hasAdmin: false,
				isLoggedIn: false,
			}),
		).toBeNull();
	});

	test("once an admin exists, /register is closed and sends to /login", () => {
		expect(
			resolveAuthRedirect({
				pathname: "/register",
				hasAdmin: true,
				isLoggedIn: false,
			}),
		).toBe("/login");
	});

	test("a logged-in admin visiting /register or /login goes home", () => {
		for (const pathname of ["/register", "/login"]) {
			expect(
				resolveAuthRedirect({ pathname, hasAdmin: true, isLoggedIn: true }),
			).toBe("/");
		}
	});

	test("anonymous visitors of protected pages go to /login", () => {
		expect(
			resolveAuthRedirect({
				pathname: "/users/42",
				hasAdmin: true,
				isLoggedIn: false,
			}),
		).toBe("/login");
	});

	test("anonymous visitors can open /login", () => {
		expect(
			resolveAuthRedirect({
				pathname: "/login",
				hasAdmin: true,
				isLoggedIn: false,
			}),
		).toBeNull();
	});

	test("logged-in admins reach protected pages", () => {
		expect(
			resolveAuthRedirect({
				pathname: "/users",
				hasAdmin: true,
				isLoggedIn: true,
			}),
		).toBeNull();
	});

	test("better-auth's own API is never redirected", () => {
		expect(
			resolveAuthRedirect({
				pathname: "/api/auth/sign-up/email",
				hasAdmin: false,
				isLoggedIn: false,
			}),
		).toBeNull();
		expect(
			resolveAuthRedirect({
				pathname: "/api/auth/sign-in/email",
				hasAdmin: true,
				isLoggedIn: false,
			}),
		).toBeNull();
	});
});
