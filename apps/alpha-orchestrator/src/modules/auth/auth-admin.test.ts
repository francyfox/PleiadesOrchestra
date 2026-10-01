import { describe, expect, test } from "bun:test";
import { admin, NOW, setupAdminApp } from "../http/http.testing.ts";
import { upsertIdentifiedUser } from "../users/users.service.ts";

describe("admin auth", () => {
	test("the transport key gets 401 on /v1/admin/*", async () => {
		const { app } = setupAdminApp();
		const response = await app.handle(
			admin("/stats", { key: "transport-key" }),
		);
		expect(response.status).toBe(401);
	});

	test("mutations without X-Admin-Id → 400, reads don't need it", async () => {
		const { app, db } = setupAdminApp();
		const user = upsertIdentifiedUser(db, "ch_telegram", "1", undefined, NOW);
		expect(
			(
				await app.handle(
					admin(`/users/${user.id}/whitelist`, {
						method: "POST",
						adminId: null,
					}),
				)
			).status,
		).toBe(400);
		expect((await app.handle(admin("/stats", { adminId: null }))).status).toBe(
			200,
		);
	});
});
