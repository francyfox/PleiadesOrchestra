import { describe, expect, test } from "bun:test";
import {
	admin,
	DAY,
	json,
	NOW,
	seedLlmCall,
	setupAdminApp,
} from "../http/http.testing.ts";
import { upsertIdentifiedUser } from "../users/users.service.ts";

describe("admin usage", () => {
	test("groupBy user labels deleted users; groupBy day buckets by UTC day", async () => {
		const { app, db } = setupAdminApp();
		const user = upsertIdentifiedUser(db, "ch_telegram", "1", "Ivan", NOW);
		seedLlmCall(db, user.id, NOW - DAY, 10, 1);
		seedLlmCall(db, null, NOW, 5, null);

		const byUser = await json(await app.handle(admin("/usage?groupBy=user")));
		expect(byUser.rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: user.id,
					label: "Ivan",
					inputTokens: 10,
				}),
				expect.objectContaining({
					key: null,
					label: "(удалён)",
					callsWithoutUsage: 1,
				}),
			]),
		);

		const byDay = await json(await app.handle(admin("/usage?groupBy=day")));
		expect(byDay.rows.map((r: { key: string }) => r.key)).toEqual([
			"2026-09-23",
			"2026-09-24",
		]);

		const byChannel = await json(
			await app.handle(admin("/usage?groupBy=channel&channel=telegram")),
		);
		expect(byChannel.rows).toEqual([
			expect.objectContaining({ key: "telegram", calls: 2 }),
		]);
	});
});
