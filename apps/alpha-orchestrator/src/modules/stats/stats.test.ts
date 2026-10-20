import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { visitors } from "../database/database.schema.ts";
import {
	admin,
	DAY,
	json,
	NOW,
	seedLlmCall,
	setupAdminApp,
} from "../http/http.testing.ts";
import { upsertIdentifiedVisitor } from "../visitors/visitors.service.ts";

describe("admin stats", () => {
	test("stats counts visitors by status and usage windows", async () => {
		const { app, db } = setupAdminApp();
		upsertIdentifiedVisitor(db, "ch_telegram", "1", undefined, NOW);
		const blocked = upsertIdentifiedVisitor(db, "ch_cli", "2", undefined, NOW);
		db.update(visitors)
			.set({ blockedAt: NOW })
			.where(eq(visitors.id, blocked.id))
			.run();
		seedLlmCall(db, null, NOW - 2 * DAY, 3, 3);

		const result = await json(await app.handle(admin("/stats")));
		expect(result.visitors).toEqual({
			total: 2,
			pending: 1,
			blocked: 1,
			anonymous: 0,
		});
		expect(result.usage.today.calls).toBe(0);
		expect(result.usage.last7d).toEqual({
			inputTokens: 3,
			outputTokens: 3,
			calls: 1,
			callsWithoutUsage: 0,
		});
	});
});
