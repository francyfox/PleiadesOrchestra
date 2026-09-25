import { describe, expect, test } from "bun:test";
import { banRefusal } from "./admin-policy";

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
