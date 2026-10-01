import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { testApp } from "../../app.testing.ts";
import { schema } from "../database/database.ts";
import { createAdminDirectory, superAdminId } from "./admins.service.ts";

describe("createAdminDirectory", () => {
	test("knows nothing on a fresh install and is not fooled by asking early", async () => {
		const { db } = testApp();
		const directory = createAdminDirectory(db);
		expect(await directory.hasAdmin()).toBe(false);
		expect(await directory.superId()).toBeNull();
	});

	test("finds the first account as super admin and keeps it as more join", async () => {
		const { db, registerFirst, addAdmin } = testApp();
		const directory = createAdminDirectory(db);
		const cookie = await registerFirst();
		const first = await superAdminId(db);
		expect(first).not.toBeNull();
		expect(await directory.hasAdmin()).toBe(true);
		expect(await directory.superId()).toBe(first);

		await addAdmin(cookie, "second@example.com");
		expect(await directory.superId()).toBe(first);
	});

	test("remembers the super admin without asking the database again", async () => {
		const { db, registerFirst } = testApp();
		const directory = createAdminDirectory(db);
		await registerFirst();
		const first = await directory.superId();
		// Even if the row vanished underneath, the remembered answer stands:
		// the super admin can't be deleted through the API.
		await db.delete(schema.user).where(eq(schema.user.id, first as string));
		expect(await directory.superId()).toBe(first);
	});
});
