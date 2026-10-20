import { describe, expect, test } from "bun:test";
import { isAllowed, visitorStatus } from "./access.service.ts";

const openChannel = { accessMode: "open" as const, disabledAt: null };
const whitelistChannel = { accessMode: "whitelist" as const, disabledAt: null };
const plainVisitor = { blockedAt: null, whitelistedAt: null };

describe("visitorStatus", () => {
	test("blocked wins over whitelisted", () => {
		expect(
			visitorStatus(whitelistChannel, { blockedAt: 1, whitelistedAt: 1 }),
		).toBe("blocked");
	});

	test("pending on a whitelist channel without whitelistedAt", () => {
		expect(visitorStatus(whitelistChannel, plainVisitor)).toBe("pending");
	});

	test("allowed once whitelisted", () => {
		expect(
			visitorStatus(whitelistChannel, { blockedAt: null, whitelistedAt: 5 }),
		).toBe("allowed");
	});

	test("allowed on an open channel without whitelisting", () => {
		expect(visitorStatus(openChannel, plainVisitor)).toBe("allowed");
	});

	test("a disabled channel does not change the user's own status", () => {
		expect(visitorStatus({ ...openChannel, disabledAt: 1 }, plainVisitor)).toBe(
			"allowed",
		);
	});
});

describe("isAllowed", () => {
	test("denies everyone on a disabled channel", () => {
		expect(isAllowed({ ...openChannel, disabledAt: 1 }, plainVisitor)).toBe(
			false,
		);
	});

	test("denies blocked and pending visitors, allows the rest", () => {
		expect(isAllowed(openChannel, { blockedAt: 1, whitelistedAt: null })).toBe(
			false,
		);
		expect(isAllowed(whitelistChannel, plainVisitor)).toBe(false);
		expect(isAllowed(openChannel, plainVisitor)).toBe(true);
	});
});
