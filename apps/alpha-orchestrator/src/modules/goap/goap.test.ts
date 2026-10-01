import { describe, expect, test } from "bun:test";
import { admin, json, NOW, setupAdminApp } from "../http/http.testing.ts";
import { finishPlanRun, startPlanRun } from "../plan-runs/plan-runs.service.ts";
import { resolveThreadId } from "../threads/threads.service.ts";
import { upsertIdentifiedUser } from "../users/users.service.ts";
import { customerFacts } from "./goap.service.ts";

describe("admin goap actions", () => {
	test("goap/actions exposes the catalog without execute", async () => {
		const { app } = setupAdminApp();
		const body = await json(await app.handle(admin("/goap/actions")));
		expect(body).toEqual({
			actions: [
				{
					name: "generateReply",
					cost: 5,
					preconditions: {},
					effects: { replied: true },
				},
			],
		});
	});

	test("goap/actions?userId= also lists that user's dynamic actions (e.g. a WebMCP tool catalog), reconstructed from their run history", async () => {
		const { app, db } = setupAdminApp();
		const user = upsertIdentifiedUser(db, "ch_cli", "2", undefined, NOW);
		const thread = resolveThreadId(db, "ch_cli", user.id, "t2", NOW);
		startPlanRun(db, {
			id: "r-dynamic",
			userId: user.id,
			threadId: thread,
			goal: { replied: true, catalogSearched: true },
			createdAt: NOW,
		});
		finishPlanRun(db, "r-dynamic", {
			succeeded: true,
			durationMs: 12,
			events: [
				{
					type: "planned",
					attempt: 0,
					plan: [
						{ name: "search_products", cost: 3 },
						{ name: "generateReply", cost: 5 },
					],
					totalCost: 8,
					state: {},
					at: NOW,
				},
				{
					type: "action_started",
					attempt: 0,
					action: "search_products",
					at: NOW,
				},
				{
					type: "action_finished",
					attempt: 0,
					action: "search_products",
					durationMs: 5,
					expectedEffects: {
						catalogSearched: true,
						"toolResult:search_products": true,
					},
					observedEffects: {
						catalogSearched: true,
						"toolResult:search_products": true,
					},
					at: NOW + 1,
				},
				{
					type: "action_started",
					attempt: 0,
					action: "generateReply",
					at: NOW + 2,
				},
				{
					type: "action_finished",
					attempt: 0,
					action: "generateReply",
					durationMs: 3,
					expectedEffects: { replied: true },
					observedEffects: { replied: true },
					at: NOW + 3,
				},
				{
					type: "finished",
					succeeded: true,
					attempts: 1,
					durationMs: 12,
					at: NOW + 3,
				},
			],
		});

		const withoutUserId = await json(await app.handle(admin("/goap/actions")));
		expect(withoutUserId.dynamicActions).toBeUndefined();

		const body = await json(
			await app.handle(admin(`/goap/actions?userId=${user.id}`)),
		);
		expect(body.actions).toHaveLength(1); // the static catalog is unchanged
		expect(body.dynamicActions).toEqual([
			{
				name: "search_products",
				cost: 3,
				effects: {
					catalogSearched: true,
					"toolResult:search_products": true,
				},
				lastSeenAt: NOW + 1,
			},
		]);
	});
});

describe("customerFacts", () => {
	test("prefixes every key so it can't collide with bookkeeping facts", () => {
		expect(customerFacts({ city: "Almaty", vip: true, floor: 3 })).toEqual({
			"customer:city": "Almaty",
			"customer:vip": true,
			"customer:floor": 3,
		});
	});

	test("no context means no facts", () => {
		expect(customerFacts(undefined)).toEqual({});
	});
});
