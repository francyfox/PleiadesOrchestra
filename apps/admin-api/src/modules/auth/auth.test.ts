import { describe, expect, test } from "bun:test";
import { testApp } from "../../app.testing.ts";
import { countAdmins, createStaff } from "../admins/admins.service.ts";

const PASSWORD = "correct-horse-battery";

function signUp(auth: ReturnType<typeof testApp>["auth"], extra = {}) {
	return auth.api.signUpEmail({
		body: { email: "u@example.com", password: PASSWORD, name: "U", ...extra },
	});
}

describe("account levels", () => {
	test("a sign-up is a customer: level 200, role user, not staff", async () => {
		const { auth, db } = testApp();
		const { user } = await signUp(auth);
		const row = await db.query.user.findFirst();
		expect(row?.id).toBe(user.id);
		expect(row?.level).toBe(200);
		expect(row?.role).toBe("user");
		expect(await countAdmins(db)).toBe(0);
	});

	test("a sign-up body cannot choose the level", async () => {
		const { auth, db } = testApp();
		// `level` is not an input field: it is refused or ignored, never honoured.
		await signUp(auth, { level: 0 }).catch(() => {});
		const rows = await db.query.user.findMany();
		expect(rows.every((row) => row.level === 200)).toBe(true);
		expect(await countAdmins(db)).toBe(0);
	});

	test("staff get role admin and a verified email", async () => {
		const { auth, db } = testApp();
		await createStaff(auth, { name: "S", email: "s@example.com", level: 0 });
		const row = await db.query.user.findFirst();
		expect(row?.level).toBe(0);
		expect(row?.role).toBe("admin");
		expect(row?.emailVerified).toBe(true);
	});
});
