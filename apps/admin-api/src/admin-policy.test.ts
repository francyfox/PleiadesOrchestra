import { describe, expect, test } from "bun:test";
import { banRefusal, deleteRefusal, passwordRefusal } from "./admin-policy";

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
	const base = {
		actorId: "a",
		targetBanned: false,
		activeAdmins: 3,
		superId: "root",
	};

	test("nobody else can ban the super admin", () => {
		expect(banRefusal({ ...base, targetId: "root" })).toBe("super_protected");
	});

	test("the super admin banning themselves is a plain self-ban", () => {
		expect(banRefusal({ ...base, actorId: "root", targetId: "root" })).toBe(
			"self",
		);
	});

	test("banning a regular admin is unaffected", () => {
		expect(banRefusal({ ...base, targetId: "b" })).toBeNull();
	});
});

describe("deleteRefusal", () => {
	test("the super admin may delete another admin", () => {
		expect(
			deleteRefusal({ actorId: "root", targetId: "b", superId: "root" }),
		).toBeNull();
	});

	test("a regular admin may not delete anyone, not even a peer", () => {
		expect(
			deleteRefusal({ actorId: "a", targetId: "b", superId: "root" }),
		).toBe("not_super");
	});

	test("a regular admin may not delete the super admin", () => {
		expect(
			deleteRefusal({ actorId: "a", targetId: "root", superId: "root" }),
		).toBe("not_super");
	});

	test("the super admin may not delete themselves", () => {
		expect(
			deleteRefusal({ actorId: "root", targetId: "root", superId: "root" }),
		).toBe("self");
	});
});

describe("passwordRefusal", () => {
	test("only the super admin may change the super admin's password", () => {
		expect(
			passwordRefusal({ actorId: "a", targetId: "root", superId: "root" }),
		).toBe("super_protected");
		expect(
			passwordRefusal({ actorId: "root", targetId: "root", superId: "root" }),
		).toBeNull();
	});

	test("regular targets stay open to every admin", () => {
		expect(
			passwordRefusal({ actorId: "a", targetId: "b", superId: "root" }),
		).toBeNull();
		expect(
			passwordRefusal({ actorId: "a", targetId: "a", superId: "root" }),
		).toBeNull();
	});
});
