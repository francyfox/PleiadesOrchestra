import { describe, expect, test } from "bun:test";
import { canOpen, resolveAuthRedirect } from "./auth-redirect";

const redirect = (pathname: string, level: number | null) =>
	resolveAuthRedirect({ pathname, level });

describe("resolveAuthRedirect", () => {
	test("anonymous visitors can open the staff and customer sign-in forms", () => {
		for (const pathname of [
			"/login",
			"/user/login",
			"/user/register",
			"/user/forgot",
			"/user/reset",
		]) {
			expect(redirect(pathname, null)).toBeNull();
		}
	});

	test("anonymous visitors of everything else go to /login", () => {
		for (const pathname of [
			"/",
			"/visitors/42",
			"/admins",
			"/user",
			"/user/me",
			"/register",
		]) {
			expect(redirect(pathname, null)).toBe("/login");
		}
	});

	test("a signed-in account leaves the sign-in forms for /", () => {
		for (const level of [0, 100, 200]) {
			for (const pathname of [
				"/login",
				"/user/login",
				"/user/register",
				"/user/reset",
			]) {
				expect(redirect(pathname, level)).toBe("/");
			}
		}
	});

	test("staff reach every page", () => {
		for (const level of [0, 100]) {
			for (const pathname of ["/", "/visitors", "/admins", "/models", "/faq"]) {
				expect(redirect(pathname, level)).toBeNull();
			}
		}
	});

	test("staff cannot open the customer-only /settings and /billing", () => {
		for (const level of [0, 100]) {
			expect(redirect("/settings", level)).toBe("/");
			expect(redirect("/billing", level)).toBe("/");
		}
	});

	test("a customer reaches Dashboard, Channels, Visitors, Flow, Blocked IPs, FAQ, Settings and Billing only; staff pages go to /", () => {
		for (const pathname of [
			"/",
			"/channels",
			"/visitors/42",
			"/flow",
			"/blocked-ips",
			"/faq",
			"/settings",
			"/billing",
		]) {
			expect(redirect(pathname, 200)).toBeNull();
		}
		for (const pathname of [
			"/admins",
			"/intents",
			"/agents",
			"/models",
			"/system",
			"/users",
			"/channelsx",
		]) {
			expect(redirect(pathname, 200)).toBe("/");
		}
	});

	test("the boundary: level 100 is staff, 101 is not", () => {
		expect(canOpen(100, "/admins")).toBe(true);
		expect(canOpen(101, "/admins")).toBe(false);
	});

	test("better-auth's own API is never redirected", () => {
		expect(redirect("/api/auth/token", null)).toBeNull();
	});
});
