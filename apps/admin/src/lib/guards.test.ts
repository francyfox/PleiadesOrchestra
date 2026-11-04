import { describe, expect, test } from "bun:test";
import {
	afterSignIn,
	allows,
	customerOnly,
	type Guard,
	guestOnly,
	keepRedirect,
	signedIn,
	staffOnly,
} from "./guards";

const run = (g: Guard, level: number | null, path: string) =>
	g({
		admin: level === null ? null : { level },
		url: new URL(`http://localhost${path}`),
	});

describe("guards", () => {
	test("signedIn sends an anonymous visitor to the customer sign-in, remembering the page", () => {
		expect(run(signedIn, null, "/billing")).toBe(
			"/user/login?redirect=%2Fbilling",
		);
		expect(run(signedIn, null, "/visitors/42?x=1")).toBe(
			"/user/login?redirect=%2Fvisitors%2F42%3Fx%3D1",
		);
		expect(run(signedIn, null, "/")).toBe("/user/login");
		for (const level of [0, 100, 200])
			expect(run(signedIn, level, "/")).toBe(true);
	});

	test("staffOnly: anonymous to the staff sign-in, a customer home, staff through", () => {
		expect(run(staffOnly, null, "/admins")).toBe("/login?redirect=%2Fadmins");
		expect(run(staffOnly, 200, "/admins")).toBe("/");
		expect(run(staffOnly, 101, "/admins")).toBe("/");
		expect(run(staffOnly, 0, "/admins")).toBe(true);
		expect(run(staffOnly, 100, "/admins")).toBe(true);
	});

	test("customerOnly sends staff home (they have no customer account)", () => {
		expect(run(customerOnly, 0, "/billing")).toBe("/");
		expect(run(customerOnly, 100, "/settings")).toBe("/");
		expect(run(customerOnly, 200, "/billing")).toBe(true);
	});

	test("guestOnly lets anonymous visitors in and sends an account to where it was going", () => {
		expect(run(guestOnly, null, "/user/login")).toBe(true);
		expect(run(guestOnly, 200, "/user/login")).toBe("/");
		expect(run(guestOnly, 200, "/user/login?redirect=%2Fbilling")).toBe(
			"/billing",
		);
	});

	test("afterSignIn follows only paths of this site", () => {
		const after = (redirect: string) =>
			afterSignIn(
				new URL(
					`http://localhost/user/login?redirect=${encodeURIComponent(redirect)}`,
				),
			);
		expect(after("/billing?x=1")).toBe("/billing?x=1");
		for (const outside of [
			"https://evil.example",
			"//evil.example",
			"/\\evil.example",
			"javascript:alert(1)",
			"billing",
		])
			expect(after(outside)).toBe("/");
	});

	test("keepRedirect carries only ?redirect= to the other sign-in form", () => {
		const url = (search: string) =>
			new URL(`http://localhost/user/login${search}`);
		expect(keepRedirect(url("?redirect=%2Fbilling&verified=1"))).toBe(
			"?redirect=%2Fbilling",
		);
		expect(keepRedirect(url("?verified=1"))).toBe("");
	});

	test("allows: what the sidebar shows to whom", () => {
		expect(allows("all", 200)).toBe(true);
		expect(allows("staff", 100)).toBe(true);
		expect(allows("staff", 200)).toBe(false);
		expect(allows("customer", 200)).toBe(true);
		expect(allows("customer", 0)).toBe(false);
	});
});
