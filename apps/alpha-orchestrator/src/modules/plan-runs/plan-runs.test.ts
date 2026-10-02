import { describe, expect, test } from "bun:test";
import type { PlanTraceEvent } from "@repo/core";
import { eq } from "drizzle-orm";
import { planEvents, planRuns } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import { resolveThreadId } from "../threads/threads.service.ts";
import { upsertIdentifiedUser } from "../users/users.service.ts";
import {
	finishPlanRun,
	joinRequest,
	startPlanRun,
	toEventRow,
	truncateStrings,
} from "./plan-runs.service.ts";

describe("truncateStrings", () => {
	test("cuts long strings deep inside objects and arrays", () => {
		const long = "x".repeat(600);
		const result = truncateStrings(
			{ a: long, b: [long, 1], c: { d: "ok" } },
			500,
		) as {
			a: string;
			b: [string, number];
			c: { d: string };
		};
		expect(result.a.length).toBe(501);
		expect(result.a.endsWith("…")).toBe(true);
		expect(result.b[1]).toBe(1);
		expect(result.c.d).toBe("ok");
	});
});

describe("toEventRow", () => {
	test("lifts type/attempt/action/at to columns, keeps the rest as payload", () => {
		const event: PlanTraceEvent = {
			type: "action_finished",
			attempt: 0,
			action: "generateReply",
			durationMs: 4,
			expectedEffects: { replied: true },
			observedEffects: { replied: true },
			at: 9,
		};
		expect(toEventRow("run", 3, event)).toEqual({
			runId: "run",
			seq: 3,
			type: "action_finished",
			attempt: 0,
			action: "generateReply",
			at: 9,
			payload: {
				durationMs: 4,
				expectedEffects: { replied: true },
				observedEffects: { replied: true },
			},
		});
	});

	test("the finished event has no attempt field — stored as its attempts count", () => {
		const row = toEventRow("run", 0, {
			type: "finished",
			succeeded: true,
			attempts: 2,
			durationMs: 1,
			at: 1,
		});
		expect(row.attempt).toBe(2);
		expect(row.action).toBeNull();
	});
});

describe("startPlanRun / finishPlanRun", () => {
	test("creates the run up front and completes it with its events in one go", () => {
		const db = testDb();
		const user = upsertIdentifiedUser(db, "ch_cli", "u", undefined, 1);
		const thread = resolveThreadId(db, "ch_cli", user.id, "t", 1);
		startPlanRun(db, {
			id: "r1",
			userId: user.id,
			threadId: thread,
			goal: { replied: true },
			createdAt: 5,
		});
		expect(db.select().from(planRuns).get()).toMatchObject({
			id: "r1",
			succeeded: false,
			attempts: 0,
		});

		finishPlanRun(db, "r1", {
			succeeded: true,
			durationMs: 12,
			events: [
				{
					type: "planned",
					attempt: 0,
					plan: [],
					totalCost: 0,
					state: {},
					at: 6,
				},
				{
					type: "finished",
					succeeded: true,
					attempts: 1,
					durationMs: 12,
					at: 7,
				},
			],
		});
		expect(db.select().from(planRuns).get()).toMatchObject({
			succeeded: true,
			attempts: 1,
			durationMs: 12,
		});
		expect(
			db
				.select()
				.from(planEvents)
				.all()
				.map((e) => e.seq),
		).toEqual([0, 1]);
	});

	test("without trace events, attempts falls back to 1", () => {
		const db = testDb();
		const user = upsertIdentifiedUser(db, "ch_cli", "u", undefined, 1);
		const thread = resolveThreadId(db, "ch_cli", user.id, "t", 1);
		startPlanRun(db, {
			id: "r1",
			userId: user.id,
			threadId: thread,
			goal: {},
			createdAt: 5,
		});
		finishPlanRun(db, "r1", { succeeded: false, durationMs: 1, events: [] });
		expect(db.select().from(planRuns).get()?.attempts).toBe(1);
	});
});

describe("finishPlanRun with a long trace", () => {
	test("stores every event, in order, even when it needs several INSERT batches", () => {
		const db = testDb();
		const user = upsertIdentifiedUser(db, "ch_cli", "u", undefined, 1);
		const thread = resolveThreadId(db, "ch_cli", user.id, "t", 1);
		startPlanRun(db, {
			id: "long",
			userId: user.id,
			threadId: thread,
			goal: {},
			createdAt: 1,
		});
		const events: PlanTraceEvent[] = Array.from({ length: 1200 }, (_, i) => ({
			type: "action_skipped",
			attempt: 0,
			action: `a${i}`,
			unmetPreconditions: {},
			at: i,
		}));

		finishPlanRun(db, "long", { succeeded: true, durationMs: 1, events });

		const rows = db.select().from(planEvents).orderBy(planEvents.seq).all();
		expect(rows).toHaveLength(1200);
		expect(rows[0]?.action).toBe("a0");
		expect(rows[1199]?.action).toBe("a1199");
		expect(rows[1199]?.seq).toBe(1199);
	});
});

describe("a request is a chain of runs", () => {
	function setup() {
		const db = testDb();
		const user = upsertIdentifiedUser(db, "ch_cli", "1", undefined, 1);
		const thread = resolveThreadId(db, "ch_cli", user.id, "t", 1);
		const start = (id: string, prompt?: string) =>
			startPlanRun(db, {
				id,
				userId: user.id,
				threadId: thread,
				goal: {},
				createdAt: 1,
				prompt,
			});
		const row = (id: string) =>
			db.select().from(planRuns).where(eq(planRuns.id, id)).get();
		return { db, start, row };
	}

	test("a new run is its own root and keeps the prompt, cut to 2000 characters", () => {
		const { start, row } = setup();
		start("a", "x".repeat(2500));
		expect(row("a")?.rootRunId).toBe("a");
		expect(row("a")?.prompt?.length).toBe(2000);
	});

	test("a resumed run joins the root of the run it continues", () => {
		const { db, start, row } = setup();
		start("a", "купи 1 сыр");
		start("b");
		start("c");
		joinRequest(db, "b", "a");
		joinRequest(db, "c", "b");
		expect(row("b")?.rootRunId).toBe("a");
		expect(row("c")?.rootRunId).toBe("a");
		expect(row("b")?.prompt).toBeNull();
	});

	test("continuing a run that does not exist leaves the run as its own root", () => {
		const { db, start, row } = setup();
		start("a");
		joinRequest(db, "a", "gone");
		expect(row("a")?.rootRunId).toBe("a");
	});
});
