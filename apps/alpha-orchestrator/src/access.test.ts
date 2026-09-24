import { describe, expect, test } from "bun:test";
import { isAllowed, userStatus } from "./access.ts";

const openChannel = { accessMode: "open" as const, disabledAt: null };
const whitelistChannel = { accessMode: "whitelist" as const, disabledAt: null };
const plainUser = { blockedAt: null, whitelistedAt: null };

describe("userStatus", () => {
	test("blocked wins over whitelisted", () => {
		expect(
			userStatus(whitelistChannel, { blockedAt: 1, whitelistedAt: 1 }),
		).toBe("blocked");
	});

	test("pending on a whitelist channel without whitelistedAt", () => {
		expect(userStatus(whitelistChannel, plainUser)).toBe("pending");
	});

	test("allowed once whitelisted", () => {
		expect(
			userStatus(whitelistChannel, { blockedAt: null, whitelistedAt: 5 }),
		).toBe("allowed");
	});

	test("allowed on an open channel without whitelisting", () => {
		expect(userStatus(openChannel, plainUser)).toBe("allowed");
	});

	test("a disabled channel does not change the user's own status", () => {
		expect(userStatus({ ...openChannel, disabledAt: 1 }, plainUser)).toBe(
			"allowed",
		);
	});
});

describe("isAllowed", () => {
	test("denies everyone on a disabled channel", () => {
		expect(isAllowed({ ...openChannel, disabledAt: 1 }, plainUser)).toBe(false);
	});

	test("denies blocked and pending users, allows the rest", () => {
		expect(isAllowed(openChannel, { blockedAt: 1, whitelistedAt: null })).toBe(
			false,
		);
		expect(isAllowed(whitelistChannel, plainUser)).toBe(false);
		expect(isAllowed(openChannel, plainUser)).toBe(true);
	});
});
