import { describe, expect, test } from "bun:test";
import { testApp } from "../../app.testing.ts";
import { createOrRotateStaff } from "./admins-cli.service.ts";

describe("admin:create", () => {
	test("the first account is a super admin, the next ones admins", async () => {
		const t = testApp();
		const first = await createOrRotateStaff(t.db, t.auth, {
			email: "a@example.com",
			name: "A",
		});
		const second = await createOrRotateStaff(t.db, t.auth, {
			email: "b@example.com",
		});
		expect(first).toMatchObject({ ok: true, created: true });
		const levels = (await t.db.query.user.findMany()).map((u) => [
			u.email,
			u.level,
		]);
		expect(levels).toEqual([
			["a@example.com", 0],
			["b@example.com", 100],
		]);
		expect(second.ok && (await t.signInWith(second.token))).toContain(
			"session_token",
		);
	});

	test("--level overrides, and only 0 or 100 are accepted", async () => {
		const t = testApp();
		await createOrRotateStaff(t.db, t.auth, {
			email: "a@example.com",
			level: "100",
		});
		expect((await t.db.query.user.findFirst())?.level).toBe(100);
		expect(
			await createOrRotateStaff(t.db, t.auth, {
				email: "b@example.com",
				level: "200",
			}),
		).toEqual({
			ok: false,
			error: "--level must be 0 or 100",
		});
	});

	test("a bad or missing email is refused", async () => {
		const t = testApp();
		for (const email of [undefined, "", "nope"]) {
			expect((await createOrRotateStaff(t.db, t.auth, { email })).ok).toBe(
				false,
			);
		}
	});

	test("an existing staff email gets a new token and the old one stops", async () => {
		const t = testApp();
		const first = await createOrRotateStaff(t.db, t.auth, {
			email: "a@example.com",
		});
		const again = await createOrRotateStaff(t.db, t.auth, {
			email: "A@example.com",
		});
		expect(again).toMatchObject({ ok: true, created: false });
		expect(await t.db.query.user.findMany()).toHaveLength(1);
		if (!first.ok || !again.ok) throw new Error("expected success");
		expect(await t.signInWith(first.token)).toBe("");
		expect(await t.signInWith(again.token)).toContain("session_token");
	});

	test("a customer email is refused, not promoted", async () => {
		const t = testApp();
		await t.signedUser("c@example.com");
		const result = await createOrRotateStaff(t.db, t.auth, {
			email: "c@example.com",
		});
		expect(result.ok).toBe(false);
		expect((await t.db.query.user.findFirst())?.level).toBe(200);
	});
});
