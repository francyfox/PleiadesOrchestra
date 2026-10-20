import { describe, expect, test } from "bun:test";
import {
	banRefusal,
	deleteRefusal,
	isEmail,
	manageRefusal,
} from "./admin-policy.service.ts";

describe("banRefusal", () => {
	test("allows banning another active admin while others remain", () => {
		expect(
			banRefusal({
				actorId: "a",
				targetId: "b",
				targetBanned: false,
				activeAdmins: 2,
			}),
		).toBeNull();
	});

	test("refuses to ban yourself", () => {
		expect(
			banRefusal({
				actorId: "a",
				targetId: "a",
				targetBanned: false,
				activeAdmins: 3,
			}),
		).toBe("self");
	});

	test("refuses to ban the last active admin", () => {
		expect(
			banRefusal({
				actorId: "a",
				targetId: "b",
				targetBanned: false,
				activeAdmins: 1,
			}),
		).toBe("last_admin");
	});

	test("an already banned target is a no-op, not a refusal", () => {
		expect(
			banRefusal({
				actorId: "a",
				targetId: "b",
				targetBanned: true,
				activeAdmins: 1,
			}),
		).toBeNull();
	});
});

describe("banRefusal with a super admin", () => {
	const base = { actorId: "a", targetBanned: false, activeAdmins: 3 };

	test("nobody else can ban a super admin", () => {
		expect(banRefusal({ ...base, targetId: "root", targetIsSuper: true })).toBe(
			"super_protected",
		);
	});

	test("a super admin banning themselves is a plain self-ban", () => {
		expect(
			banRefusal({
				...base,
				actorId: "root",
				targetId: "root",
				targetIsSuper: true,
			}),
		).toBe("self");
	});

	test("banning a regular admin is unaffected", () => {
		expect(banRefusal({ ...base, targetId: "b" })).toBeNull();
	});
});

describe("deleteRefusal", () => {
	test("a super admin may delete another admin", () => {
		expect(
			deleteRefusal({ actorId: "root", actorLevel: 0, targetId: "b" }),
		).toBeNull();
	});

	test("a regular admin may not delete anyone, not even a peer or a super", () => {
		expect(
			deleteRefusal({ actorId: "a", actorLevel: 100, targetId: "b" }),
		).toBe("not_super");
		expect(
			deleteRefusal({ actorId: "a", actorLevel: 100, targetId: "root" }),
		).toBe("not_super");
	});

	test("a super admin may not delete themselves", () => {
		expect(
			deleteRefusal({ actorId: "root", actorLevel: 0, targetId: "root" }),
		).toBe("self");
	});
});

describe("manageRefusal", () => {
	test("anyone manages their own account", () => {
		expect(
			manageRefusal({ actorId: "a", actorLevel: 100, targetId: "a" }),
		).toBeNull();
	});

	test("only a super admin manages someone else", () => {
		expect(
			manageRefusal({ actorId: "a", actorLevel: 100, targetId: "b" }),
		).toBe("not_super");
		expect(
			manageRefusal({ actorId: "root", actorLevel: 0, targetId: "b" }),
		).toBeNull();
	});
});

describe("isEmail", () => {
	test("accepts one @ with text on both sides, rejects the rest", () => {
		expect(isEmail("a@b.co")).toBe(true);
		for (const bad of ["", "a", "a@", "@b.co", "a b@c.d", "a@@b.c"]) {
			expect(isEmail(bad)).toBe(false);
		}
	});
});
