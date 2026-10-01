import { describe, expect, test } from "bun:test";
import { admin, json, NOW, setupAdminApp } from "../http/http.testing.ts";
import { resolveThreadId } from "../threads/threads.service.ts";
import { upsertIdentifiedUser } from "../users/users.service.ts";
import { finishPlanRun, startPlanRun } from "./plan-runs.service.ts";

describe("admin run view", () => {
	test("runs/:id returns the run, its events (payload split out) and its model calls", async () => {
		const { app, db } = setupAdminApp();
		const user = upsertIdentifiedUser(db, "ch_cli", "1", undefined, NOW);
		const thread = resolveThreadId(db, "ch_cli", user.id, "t", NOW);
		startPlanRun(db, {
			id: "r",
			userId: user.id,
			threadId: thread,
			goal: { replied: true },
			createdAt: NOW,
		});
		finishPlanRun(db, "r", {
			succeeded: true,
			durationMs: 9,
			events: [
				{
					type: "planned",
					attempt: 0,
					plan: [{ name: "generateReply", cost: 5 }],
					totalCost: 5,
					state: {},
					at: NOW,
				},
				{
					type: "finished",
					succeeded: true,
					attempts: 1,
					durationMs: 9,
					at: NOW,
				},
			],
		});

		const body = await json(await app.handle(admin("/runs/r")));
		expect(body.run).toMatchObject({
			id: "r",
			succeeded: true,
			goal: { replied: true },
			attempts: 1,
		});
		expect(body.events[0]).toEqual({
			seq: 0,
			type: "planned",
			attempt: 0,
			action: null,
			payload: {
				plan: [{ name: "generateReply", cost: 5 }],
				totalCost: 5,
				state: {},
			},
			at: NOW,
		});
		expect(body.llmCalls).toEqual([]);
		expect((await app.handle(admin("/runs/nope"))).status).toBe(404);
	});
});
