import { describe, expect, test } from "bun:test";
import type { PlanTraceEvent, WorldState } from "@repo/core";
import { ActiveRuns } from "../active-runs/active-runs.ts";
import { llmCalls, messages } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import { admin, json, setupAdminApp } from "../http/http.testing.ts";
import {
	finishPlanRun,
	joinRequest,
	startPlanRun,
} from "../plan-runs/plan-runs.service.ts";
import { resolveThreadId } from "../threads/threads.service.ts";
import { upsertIdentifiedUser } from "../users/users.service.ts";
import { getRequest, listRequests } from "./requests.service.ts";

const T0 = 1_000_000;

function setup() {
	const db = testDb();
	const user = upsertIdentifiedUser(db, "ch_cli", "1", undefined, 1);
	const threadId = resolveThreadId(db, "ch_cli", user.id, "t", 1);
	const active = new ActiveRuns();

	const run = (
		id: string,
		createdAt: number,
		options: { prompt?: string; parent?: string } = {},
	) => {
		startPlanRun(db, {
			id,
			userId: user.id,
			threadId,
			goal: { replied: true },
			createdAt,
			prompt: options.prompt,
		});
		if (options.parent) joinRequest(db, id, options.parent);
	};
	const finish = (
		id: string,
		succeeded: boolean,
		durationMs: number,
		events: PlanTraceEvent[],
	) => finishPlanRun(db, id, { succeeded, durationMs, events });

	return { db, user, threadId, active, run, finish };
}

const planned = (
	at: number,
	names: string[],
	state: WorldState = {},
): PlanTraceEvent => ({
	type: "planned",
	attempt: 0,
	plan: names.map((name) => ({ name, cost: 3 })),
	totalCost: 3 * names.length,
	state,
	at,
});
const started = (at: number, action: string): PlanTraceEvent => ({
	type: "action_started",
	attempt: 0,
	action,
	at,
});
const finished = (at: number, action: string): PlanTraceEvent => ({
	type: "action_finished",
	attempt: 0,
	action,
	durationMs: 5,
	expectedEffects: {},
	observedEffects: {},
	at,
});
const waiting = (at: number, action: string): PlanTraceEvent => ({
	type: "waiting",
	attempt: 0,
	action,
	waiting: { kind: "webmcp_tool_call", payload: { tool: action } },
	state: {},
	at,
});
const ended = (at: number, succeeded: boolean): PlanTraceEvent => ({
	type: "finished",
	succeeded,
	attempts: 1,
	durationMs: 1,
	at,
});

/** «купи 1 сыр»: run 1 waits on the browser for search_products, run 2 resumes and answers. */
function seedShopping(s: ReturnType<typeof setup>) {
	s.run("r1", T0, { prompt: "купи 1 сыр" });
	s.finish("r1", false, 2_000, [
		planned(T0 + 500, ["choose_store", "search_products"], {
			userMessage: "купи 1 сыр",
			messageIntent: "addToCart",
		}),
		started(T0 + 600, "choose_store"),
		finished(T0 + 700, "choose_store"),
		started(T0 + 800, "search_products"),
		waiting(T0 + 900, "search_products"),
		ended(T0 + 950, false),
	]);
	s.run("r2", T0 + 3_000, { parent: "r1" });
	s.finish("r2", true, 1_500, [
		planned(T0 + 3_100, ["search_products", "generateReply"], {}),
		started(T0 + 3_200, "search_products"),
		finished(T0 + 3_300, "search_products"),
		started(T0 + 3_400, "generateReply"),
		finished(T0 + 4_400, "generateReply"),
		ended(T0 + 4_500, true),
	]);
}

describe("listRequests", () => {
	test("one request per user message, however many runs it took", () => {
		const s = setup();
		seedShopping(s);
		s.run("solo", T0 + 100_000, { prompt: "привет" });
		s.finish("solo", true, 800, [
			planned(T0 + 100_100, ["generateReply"], { userMessage: "привет" }),
			finished(T0 + 100_800, "generateReply"),
			ended(T0 + 100_800, true),
		]);

		const { items, total } = listRequests(s.db, s.active, {}, T0 + 200_000);

		expect(total).toBe(2);
		// Newest first.
		expect(items.map((item) => item.id)).toEqual(["solo", "r1"]);
		expect(items[1]).toMatchObject({
			id: "r1",
			prompt: "купи 1 сыр",
			intent: "addToCart",
			status: "succeeded",
			runs: 2,
			steps: ["choose_store", "search_products", "generateReply"],
			startedAt: T0,
			// From the first run's start to the second run's end.
			durationMs: 3_000 + 1_500,
		});
	});

	test("pages the requests", () => {
		const s = setup();
		for (let i = 0; i < 5; i++) {
			s.run(`r${i}`, T0 + i * 1000, { prompt: `p${i}` });
			s.finish(`r${i}`, true, 10, [ended(T0 + i * 1000, true)]);
		}
		const page = listRequests(
			s.db,
			s.active,
			{ page: 2, pageSize: 2 },
			T0 + 9_000,
		);
		expect(page.total).toBe(5);
		expect(page.items.map((item) => item.id)).toEqual(["r2", "r1"]);
	});

	test("the prompt falls back to the first plan's state for runs from before it was stored", () => {
		const s = setup();
		s.run("old", T0);
		s.finish("old", true, 5, [
			planned(T0 + 1, ["generateReply"], { userMessage: "старый запрос" }),
			ended(T0 + 2, true),
		]);
		expect(listRequests(s.db, s.active, {}, T0 + 10).items[0]?.prompt).toBe(
			"старый запрос",
		);
	});

	test("status: running, waiting for the browser, abandoned, failed", () => {
		const s = setup();
		s.run("running", T0, { prompt: "a" });
		s.active.start("running", T0);

		s.run("waits", T0 + 10, { prompt: "b" });
		s.finish("waits", false, 5, [
			waiting(T0 + 12, "search_products"),
			ended(T0 + 13, false),
		]);

		s.run("failed", T0 + 20, { prompt: "c" });
		s.finish("failed", false, 5, [ended(T0 + 25, false)]);

		const byId = (now: number) =>
			Object.fromEntries(
				listRequests(s.db, s.active, {}, now).items.map((item) => [
					item.id,
					item.status,
				]),
			);
		expect(byId(T0 + 60_000)).toEqual({
			running: "running",
			waits: "waiting",
			failed: "failed",
		});
		// Nobody answered the browser for over 5 minutes: it is not coming back.
		expect(byId(T0 + 10 * 60_000).waits).toBe("abandoned");
	});

	test("filters by status and intent, and counts and pages only what matches", () => {
		const s = setup();
		for (let i = 0; i < 4; i++) {
			s.run(`ok${i}`, T0 + i * 1000, { prompt: `p${i}` });
			s.finish(`ok${i}`, true, 10, [
				planned(T0 + i * 1000, [], {
					messageIntent: i % 2 === 0 ? "search" : "addToCart",
				}),
				ended(T0 + i * 1000 + 5, true),
			]);
		}
		s.run("bad", T0 + 9_000, { prompt: "x" });
		s.finish("bad", false, 10, [ended(T0 + 9_005, false)]);

		const ids = (query: Parameters<typeof listRequests>[2]) =>
			listRequests(s.db, s.active, query, T0 + 20_000);
		expect(ids({ status: "failed" }).items.map((item) => item.id)).toEqual([
			"bad",
		]);
		expect(ids({ status: "failed" }).total).toBe(1);
		expect(ids({ intent: "search" }).items.map((item) => item.id)).toEqual([
			"ok2",
			"ok0",
		]);
		const second = ids({
			status: "succeeded",
			intent: "search",
			page: 2,
			pageSize: 1,
		});
		expect(second.total).toBe(2);
		expect(second.items.map((item) => item.id)).toEqual(["ok0"]);
		expect(ids({}).total).toBe(5);
	});

	test("a request in progress is as long as it has been going", () => {
		const s = setup();
		s.run("running", T0, { prompt: "a" });
		s.active.start("running", T0);
		expect(
			listRequests(s.db, s.active, {}, T0 + 7_000).items[0]?.durationMs,
		).toBe(7_000);
	});
});

describe("getRequest", () => {
	test("returns the prompt, every run with its events, the answer and the model calls", () => {
		const s = setup();
		seedShopping(s);
		s.db
			.insert(messages)
			.values({
				threadId: s.threadId,
				userId: s.user.id,
				role: "assistant",
				content: "Добавил Brie в корзину",
				createdAt: T0 + 4_500,
				planRunId: "r2",
			})
			.run();
		s.db
			.insert(llmCalls)
			.values({
				at: T0 + 4_400,
				userId: s.user.id,
				threadId: s.threadId,
				planRunId: "r2",
				actionName: "generateReply",
				kind: "generate",
				provider: "albedo",
				model: "vikhr",
				inputTokens: 70,
				outputTokens: 20,
				latencyMs: 1_000,
				ok: true,
			})
			.run();

		// Any run of the chain opens the request.
		const details = getRequest(s.db, s.active, "r2", T0 + 10_000);

		expect(details?.request).toMatchObject({
			id: "r1",
			prompt: "купи 1 сыр",
			intent: "addToCart",
			status: "succeeded",
			goal: { replied: true },
			reply: "Добавил Brie в корзину",
			startedAt: T0,
			durationMs: 4_500,
		});
		expect(details?.now).toBe(T0 + 10_000);
		expect(
			details?.runs.map((r) => [r.id, r.running, r.events.length]),
		).toEqual([
			["r1", false, 6],
			["r2", false, 6],
		]);
		expect(details?.runs[0]?.events[4]).toMatchObject({
			type: "waiting",
			action: "search_products",
		});
		expect(details?.llmCalls).toEqual([
			{
				planRunId: "r2",
				actionName: "generateReply",
				kind: "generate",
				provider: "albedo",
				model: "vikhr",
				inputTokens: 70,
				outputTokens: 20,
				latencyMs: 1_000,
				ok: true,
				error: null,
				at: T0 + 4_400,
			},
		]);
	});

	test("a run in progress shows the events it has so far", () => {
		const s = setup();
		s.run("live", T0, { prompt: "купи сыр" });
		s.active.start("live", T0);
		s.active.push("live", planned(T0 + 100, ["choose_store"], {}));
		s.active.push("live", started(T0 + 200, "choose_store"));

		const details = getRequest(s.db, s.active, "live", T0 + 900);

		expect(details?.request.status).toBe("running");
		expect(details?.runs[0]).toMatchObject({ id: "live", running: true });
		expect(details?.runs[0]?.events.map((event) => event.type)).toEqual([
			"planned",
			"action_started",
		]);
	});

	test("unknown request: null", () => {
		const s = setup();
		expect(getRequest(s.db, s.active, "nope", T0)).toBeNull();
	});
});

describe("admin routes", () => {
	test("GET /requests lists, GET /requests/:id opens one, an unknown id is 404", async () => {
		const { app, db } = setupAdminApp();
		const user = upsertIdentifiedUser(db, "ch_cli", "1", undefined, 1);
		const threadId = resolveThreadId(db, "ch_cli", user.id, "t", 1);
		startPlanRun(db, {
			id: "r",
			userId: user.id,
			threadId,
			goal: {},
			createdAt: 1,
			prompt: "привет",
		});
		finishPlanRun(db, "r", {
			succeeded: true,
			durationMs: 1,
			events: [ended(2, true)],
		});

		const list = await json(await app.handle(admin("/requests?pageSize=5")));
		expect(list.total).toBe(1);
		expect(list.items[0]).toMatchObject({ id: "r", prompt: "привет" });

		const one = await json(await app.handle(admin("/requests/r")));
		expect(one.request.id).toBe("r");

		expect((await app.handle(admin("/requests/nope"))).status).toBe(404);
	});
});
