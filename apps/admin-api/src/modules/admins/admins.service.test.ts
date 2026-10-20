import { describe, expect, test } from "bun:test";
import { testApp } from "../../app.testing.ts";
import { createAdminDirectory, createStaff } from "./admins.service.ts";

describe("createAdminDirectory", () => {
	test("knows nothing on a fresh install and notices the first staff account", async () => {
		const { db, registerFirst } = testApp();
		const directory = createAdminDirectory(db);
		expect(await directory.hasAdmin()).toBe(false);
		await registerFirst();
		expect(await directory.hasAdmin()).toBe(true);
	});

	test("a customer account is not an admin", async () => {
		const { db, call } = testApp();
		await call("/api/user/register", {
			method: "POST",
			body: { email: "u@example.com", password: "correct-horse-battery" },
		});
		expect(await createAdminDirectory(db).hasAdmin()).toBe(false);
	});
});

describe("createStaff", () => {
	test("stores a hash of the token, never the token", async () => {
		const { auth, db } = testApp();
		const { id, token } = await createStaff(auth, {
			name: "A",
			email: "A@Example.com",
			level: 100,
		});
		const row = await db.query.user.findFirst({
			where: (u, { eq }) => eq(u.id, id),
		});
		expect(row?.email).toBe("a@example.com");
		expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
		expect(row?.tokenHash).not.toBe(token);
		expect(token).toHaveLength(43);
	});
});
