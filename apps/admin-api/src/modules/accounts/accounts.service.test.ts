import { describe, expect, test } from "bun:test";
import { fakeOrchestrator, testApp } from "../../app.testing.ts";
import { DAY_MS } from "../common/common.service.ts";
import { schema } from "../database/database.ts";
import { deleteInactiveUsers, INACTIVE_DAYS } from "./accounts.service.ts";

const NOW = 1_800_000_000_000;
const LIMIT = INACTIVE_DAYS * DAY_MS;

function seed(
	t: ReturnType<typeof testApp>,
	id: string,
	level: number,
	lastActiveAt: number | null,
	createdAt = NOW - 10 * LIMIT,
) {
	return t.db.insert(schema.user).values({
		id,
		name: id,
		email: `${id}@example.com`,
		level,
		createdAt: new Date(createdAt),
		updatedAt: new Date(createdAt),
		lastActiveAt: lastActiveAt === null ? null : new Date(lastActiveAt),
	});
}

const ids = async (t: ReturnType<typeof testApp>) =>
	(await t.db.query.user.findMany()).map((row) => row.id).sort();

describe("deleteInactiveUsers", () => {
	test("exactly 180 days is deleted, one millisecond less is kept", async () => {
		const t = testApp();
		await seed(t, "exact", 200, NOW - LIMIT);
		await seed(t, "almost", 200, NOW - LIMIT + 1);
		await seed(t, "older", 200, NOW - LIMIT - 1);
		expect(await deleteInactiveUsers(t, NOW)).toBe(2);
		expect(await ids(t)).toEqual(["almost"]);
	});

	test("staff are never deleted, however long they were away", async () => {
		const t = testApp();
		await seed(t, "root", 0, NOW - 2 * LIMIT);
		await seed(t, "admin", 100, null);
		await seed(t, "user", 200, NOW - 2 * LIMIT);
		await deleteInactiveUsers(t, NOW);
		expect(await ids(t)).toEqual(["admin", "root"]);
	});

	test("a never-active account counts from its creation", async () => {
		const t = testApp();
		await seed(t, "old", 200, null, NOW - LIMIT);
		await seed(t, "new", 200, null, NOW - LIMIT + 1);
		await deleteInactiveUsers(t, NOW);
		expect(await ids(t)).toEqual(["new"]);
	});

	test("sessions and credentials go with the account", async () => {
		const t = testApp();
		await t.signedUser("gone@example.com");
		await t.db.update(schema.user).set({ lastActiveAt: new Date(NOW - LIMIT) });
		const count = await deleteInactiveUsers(t, NOW);
		expect(count).toBe(1);
		expect(await t.db.query.session.findMany()).toHaveLength(0);
		expect(await t.db.query.account.findMany()).toHaveLength(0);
	});

	test("nothing to delete is 0", async () => {
		expect(await deleteInactiveUsers(testApp(), NOW)).toBe(0);
	});
});

describe("deleteInactiveUsers and channels", () => {
	test("each removed account's channels are deleted first, by owner", async () => {
		const fake = fakeOrchestrator();
		const t = testApp({ orchestrator: fake.client });
		await seed(t, "old1", 200, NOW - LIMIT);
		await seed(t, "old2", 200, null);
		await seed(t, "fresh", 200, NOW);
		await deleteInactiveUsers(t, NOW);
		expect(fake.calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual([
			"DELETE /v1/admin/owners/old1/channels",
			"DELETE /v1/admin/owners/old2/channels",
		]);
		expect(fake.calls[0]?.adminId).toBe("system:inactivity");
		expect(await ids(t)).toEqual(["fresh"]);
	});

	test("an account whose channels cannot be deleted is kept, reported, and retried next run", async () => {
		let down = true;
		const fake = fakeOrchestrator((call) =>
			down && call.path.includes("/old1/")
				? new Response("down", { status: 503 })
				: Response.json({}),
		);
		const t = testApp({ orchestrator: fake.client });
		await seed(t, "old1", 200, NOW - LIMIT);
		await seed(t, "old2", 200, NOW - LIMIT);
		const failed: string[] = [];
		const ctx = {
			db: t.db,
			orchestrator: fake.client,
			onError: (id: string) => failed.push(id),
		};
		expect(await deleteInactiveUsers(ctx, NOW)).toBe(1);
		expect(failed).toEqual(["old1"]);
		expect(await ids(t)).toEqual(["old1"]);

		down = false;
		expect(await deleteInactiveUsers(ctx, NOW)).toBe(1);
		expect(await ids(t)).toEqual([]);
	});
});
