import { describe, expect, test } from "bun:test";
import { isUserAllowed } from "./access.ts";
import type { AccessRequest, AccessResult } from "./harness-client.ts";

function fakeClient(check: (request: AccessRequest) => Promise<AccessResult>) {
	return { checkAccess: check };
}

describe("isUserAllowed", () => {
	test("asks the harness with the telegram channel, the user id as a string and the username as display name", async () => {
		let captured: AccessRequest | undefined;
		const allowed = await isUserAllowed(
			fakeClient(async (request) => {
				captured = request;
				return { allowed: true, userId: "uuid" };
			}),
			{ id: 42, username: "ivan", firstName: "Ivan" },
			() => {},
		);

		expect(allowed).toBe(true);
		expect(captured).toEqual({
			channel: "telegram",
			externalUserId: "42",
			displayName: "ivan",
		});
	});

	test("falls back to firstName when there is no username", async () => {
		let captured: AccessRequest | undefined;
		await isUserAllowed(
			fakeClient(async (request) => {
				captured = request;
				return { allowed: true, userId: "uuid" };
			}),
			{ id: 42, firstName: "Ivan" },
			() => {},
		);

		expect(captured?.displayName).toBe("Ivan");
	});

	test("returns false when the harness says not allowed", async () => {
		const allowed = await isUserAllowed(
			fakeClient(async () => ({ allowed: false, userId: "uuid" })),
			{ id: 42, firstName: "Ivan" },
			() => {},
		);

		expect(allowed).toBe(false);
	});

	test("returns false and reports the error when the access check itself fails", async () => {
		let reported: unknown;
		const allowed = await isUserAllowed(
			fakeClient(async () => {
				throw new Error("harness down");
			}),
			{ id: 42, firstName: "Ivan" },
			(error) => {
				reported = error;
			},
		);

		expect(allowed).toBe(false);
		expect((reported as Error).message).toBe("harness down");
	});
});
