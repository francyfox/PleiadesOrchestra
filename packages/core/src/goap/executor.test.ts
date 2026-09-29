import { describe, expect, test } from "bun:test";
import { runPlan } from "./executor.ts";
import type { GoapAction, PlanTraceEvent } from "./types.ts";

function action(
	name: string,
	cost: number,
	preconditions: GoapAction["preconditions"],
	effects: GoapAction["effects"],
	execute: GoapAction["execute"] = async () => effects,
): GoapAction {
	return { name, cost, preconditions, effects, execute };
}

describe("runPlan", () => {
	test("executes a single action and reports success when the goal is met", async () => {
		const reply = action("reply", 1, {}, { replied: true });

		const result = await runPlan({
			state: {},
			goal: { replied: true },
			actions: [reply],
			ctx: {},
		});

		expect(result.succeeded).toBe(true);
		expect(result.executedActions).toEqual(["reply"]);
		expect(result.finalState.replied).toBe(true);
	});

	test("executes a multi-step plan in order when nothing diverges", async () => {
		const classifyIntent = action("classifyIntent", 1, {}, { intent: "buy" });
		const generateReply = action(
			"generateReply",
			5,
			{ intent: "buy" },
			{ replied: true },
		);

		const result = await runPlan({
			state: {},
			goal: { replied: true },
			actions: [generateReply, classifyIntent],
			ctx: {},
		});

		expect(result.succeeded).toBe(true);
		expect(result.executedActions).toEqual(["classifyIntent", "generateReply"]);
	});

	test("fails immediately when no plan exists at all", async () => {
		const unrelated = action("unrelated", 1, {}, { somethingElse: true });

		const result = await runPlan({
			state: {},
			goal: { replied: true },
			actions: [unrelated],
			ctx: {},
		});

		expect(result.succeeded).toBe(false);
		expect(result.executedActions).toEqual([]);
	});

	test("replans when an action's real effects diverge from its declared effects, and recovers via a fallback", async () => {
		// cheapAttempt looks free on paper (cost 1, no preconditions) and claims
		// it'll set `done`, but what it actually does is mark itself as tried —
		// its own precondition (`attemptedCheap` must be absent) then makes it
		// ineligible for re-selection once that's happened, forcing the planner
		// onto the pricier `fallback` on the next planning pass.
		const cheapAttempt = action(
			"cheapAttempt",
			1,
			{ attemptedCheap: undefined },
			{ done: true },
			async () => ({ attemptedCheap: true }),
		);
		const fallback = action(
			"fallback",
			5,
			{ attemptedCheap: true },
			{ done: true },
		);

		const result = await runPlan({
			state: {},
			goal: { done: true },
			actions: [cheapAttempt, fallback],
			ctx: {},
		});

		expect(result.succeeded).toBe(true);
		expect(result.executedActions).toEqual(["cheapAttempt", "fallback"]);
		expect(result.finalState.done).toBe(true);
	});

	test("gives up once a replan finds no further viable plan", async () => {
		const cheapAttempt = action(
			"cheapAttempt",
			1,
			{ attemptedCheap: undefined },
			{ done: true },
			async () => ({ attemptedCheap: true }),
		);

		const result = await runPlan({
			state: {},
			goal: { done: true },
			actions: [cheapAttempt],
			ctx: {},
		});

		expect(result.succeeded).toBe(false);
		expect(result.executedActions).toEqual(["cheapAttempt"]);
	});

	test("stops after maxReplans when an action never actually achieves its declared effect", async () => {
		const flaky = action("flaky", 1, {}, { done: true }, async () => ({}));

		const result = await runPlan({
			state: {},
			goal: { done: true },
			actions: [flaky],
			ctx: {},
			maxReplans: 2,
		});

		expect(result.succeeded).toBe(false);
		// initial attempt + 2 replans = 3 executions of the same flaky action
		expect(result.executedActions).toEqual(["flaky", "flaky", "flaky"]);
	});
});

function traced() {
	const events: PlanTraceEvent[] = [];
	return { events, tracer: (event: PlanTraceEvent) => events.push(event) };
}

describe("runPlan tracer", () => {
	test("emits planned → started → finished → finished(run) for a straight run", async () => {
		const reply = action("reply", 3, {}, { replied: true });
		const { events, tracer } = traced();

		await runPlan({
			state: { userMessage: "hi" },
			goal: { replied: true },
			actions: [reply],
			ctx: {},
			tracer,
		});

		expect(events.map((event) => event.type)).toEqual([
			"planned",
			"action_started",
			"action_finished",
			"finished",
		]);
		expect(events[0]).toMatchObject({
			type: "planned",
			attempt: 0,
			plan: [{ name: "reply", cost: 3 }],
			totalCost: 3,
			state: { userMessage: "hi" },
		});
		expect(events[2]).toMatchObject({
			type: "action_finished",
			attempt: 0,
			action: "reply",
			expectedEffects: { replied: true },
			observedEffects: { replied: true },
		});
		expect(events[3]).toMatchObject({
			type: "finished",
			succeeded: true,
			attempts: 1,
		});
		for (const event of events) expect(event.at).toBeNumber();
	});

	test("emits replan with the state execution actually reached, and numbers attempts from 0", async () => {
		const cheapAttempt = action(
			"cheapAttempt",
			1,
			{ attemptedCheap: undefined },
			{ done: true },
			async () => ({ attemptedCheap: true }),
		);
		const fallback = action(
			"fallback",
			5,
			{ attemptedCheap: true },
			{ done: true },
		);
		const { events, tracer } = traced();

		await runPlan({
			state: {},
			goal: { done: true },
			actions: [cheapAttempt, fallback],
			ctx: {},
			tracer,
		});

		expect(events.map((event) => event.type)).toEqual([
			"planned",
			"action_started",
			"action_finished",
			"replan",
			"planned",
			"action_started",
			"action_finished",
			"finished",
		]);
		expect(events[2]).toMatchObject({
			expectedEffects: { done: true },
			observedEffects: { attemptedCheap: true },
		});
		expect(events[3]).toMatchObject({
			type: "replan",
			attempt: 0,
			state: { attemptedCheap: true },
		});
		expect(events[4]).toMatchObject({ type: "planned", attempt: 1 });
		expect(events.at(-1)).toMatchObject({ succeeded: true, attempts: 2 });
	});

	test("emits action_skipped with the unmet preconditions when an earlier action under-delivers", async () => {
		const prepare = action(
			"prepare",
			1,
			{},
			{ prepared: true },
			async () => ({}),
		);
		const reply = action("reply", 1, { prepared: true }, { replied: true });
		const { events, tracer } = traced();

		await runPlan({
			state: {},
			goal: { replied: true },
			actions: [prepare, reply],
			ctx: {},
			tracer,
			maxReplans: 0,
		});

		expect(events.map((event) => event.type)).toEqual([
			"planned",
			"action_started",
			"action_finished",
			"action_skipped",
			"finished",
		]);
		expect(events[3]).toMatchObject({
			type: "action_skipped",
			action: "reply",
			unmetPreconditions: { prepared: true },
		});
		expect(events.at(-1)).toMatchObject({ succeeded: false, attempts: 1 });
	});

	test("emits no_plan when nothing reaches the goal", async () => {
		const { events, tracer } = traced();

		await runPlan({
			state: {},
			goal: { replied: true },
			actions: [],
			ctx: {},
			tracer,
		});

		expect(events.map((event) => event.type)).toEqual(["no_plan", "finished"]);
		expect(events.at(-1)).toMatchObject({ succeeded: false, attempts: 1 });
	});

	test("emits action_failed and finished, then rethrows the action's error", async () => {
		const broken = action("broken", 1, {}, { replied: true }, async () => {
			throw new Error("tool exploded");
		});
		const { events, tracer } = traced();

		await expect(
			runPlan({
				state: {},
				goal: { replied: true },
				actions: [broken],
				ctx: {},
				tracer,
			}),
		).rejects.toThrow("tool exploded");

		expect(events.map((event) => event.type)).toEqual([
			"planned",
			"action_started",
			"action_failed",
			"finished",
		]);
		expect(events[2]).toMatchObject({
			type: "action_failed",
			action: "broken",
			error: "tool exploded",
		});
		expect(events[3]).toMatchObject({ succeeded: false });
	});

	test("a throwing tracer doesn't break the run", async () => {
		const reply = action("reply", 1, {}, { replied: true });

		const result = await runPlan({
			state: {},
			goal: { replied: true },
			actions: [reply],
			ctx: {},
			tracer: () => {
				throw new Error("tracer bug");
			},
		});

		expect(result.succeeded).toBe(true);
	});
});

describe("runPlan cancellation", () => {
	test("returns killed:true without planning when the signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();
		const reply = action("reply", 1, {}, { replied: true });
		const { events, tracer } = traced();

		const result = await runPlan({
			state: {},
			goal: { replied: true },
			actions: [reply],
			ctx: {},
			signal: controller.signal,
			tracer,
		});

		expect(result).toMatchObject({
			succeeded: false,
			killed: true,
			executedActions: [],
		});
		expect(events.map((event) => event.type)).toEqual(["killed", "finished"]);
	});

	test("stops between actions once the signal aborts mid-run, without running the rest of the plan", async () => {
		const controller = new AbortController();
		const first = action("first", 1, {}, { step1: true }, async () => {
			controller.abort();
			return { step1: true };
		});
		const second = action("second", 1, { step1: true }, { replied: true });
		const { events, tracer } = traced();

		const result = await runPlan({
			state: {},
			goal: { replied: true },
			actions: [second, first],
			ctx: {},
			signal: controller.signal,
			tracer,
		});

		expect(result.succeeded).toBe(false);
		expect(result.killed).toBe(true);
		expect(result.executedActions).toEqual(["first"]);
		expect(events.map((event) => event.type)).toEqual([
			"planned",
			"action_started",
			"action_finished",
			"killed",
			"finished",
		]);
	});

	test("passes the signal through to execute()'s context", async () => {
		const controller = new AbortController();
		let seen: AbortSignal | undefined;
		const reply = action("reply", 1, {}, { replied: true }, async (ctx) => {
			seen = ctx.signal;
			return { replied: true };
		});

		await runPlan({
			state: {},
			goal: { replied: true },
			actions: [reply],
			ctx: {},
			signal: controller.signal,
		});

		expect(seen).toBe(controller.signal);
	});
});
