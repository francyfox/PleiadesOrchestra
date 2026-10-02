import { describe, expect, test } from "bun:test";
import { runPlan } from "./executor.ts";
import type { ActionResult, GoapAction, PlanTraceEvent } from "./types.ts";

function action(
	name: string,
	cost: number,
	preconditions: GoapAction["preconditions"],
	effects: GoapAction["effects"],
	execute: (
		ctx: Parameters<GoapAction["execute"]>[0],
	) => Promise<ActionResult> = async () => effects,
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

describe("runPlan waiting", () => {
	test("an action returning `waiting` stops the run immediately, without throwing or counting as failure the same way no_plan does", async () => {
		const askBrowser = action(
			"askBrowser",
			1,
			{},
			{ inCart: true },
			async () => ({
				waiting: { kind: "webmcp_tool_call", payload: { tool: "add_to_cart" } },
			}),
		);
		const { events, tracer } = traced();

		const result = await runPlan({
			state: {},
			goal: { inCart: true },
			actions: [askBrowser],
			ctx: {},
			tracer,
		});

		expect(result.succeeded).toBe(false);
		expect(result.killed).toBe(false);
		expect(result.waiting).toEqual({
			kind: "webmcp_tool_call",
			payload: { tool: "add_to_cart" },
		});
		expect(result.executedActions).toEqual([]);
		expect(events.map((event) => event.type)).toEqual([
			"planned",
			"action_started",
			"waiting",
			"finished",
		]);
		expect(events[2]).toMatchObject({
			type: "waiting",
			action: "askBrowser",
			waiting: { kind: "webmcp_tool_call", payload: { tool: "add_to_cart" } },
		});
		expect(events.at(-1)).toMatchObject({ succeeded: false, attempts: 1 });
	});

	test("doesn't run any action after the one that waits, even earlier in the same plan", async () => {
		const askBrowser = action(
			"askBrowser",
			1,
			{},
			{ inCart: true },
			async () => ({
				waiting: { kind: "webmcp_tool_call", payload: { tool: "add_to_cart" } },
			}),
		);
		let replyRan = false;
		const reply = action(
			"reply",
			5,
			{ inCart: true },
			{ replied: true },
			async () => {
				replyRan = true;
				return { replied: true };
			},
		);

		const result = await runPlan({
			state: {},
			goal: { inCart: true, replied: true },
			actions: [askBrowser, reply],
			ctx: {},
		});

		expect(result.waiting).toBeDefined();
		expect(replyRan).toBe(false);
	});

	test("resuming is just calling runPlan again with the result merged into state — the same action now returns real effects", async () => {
		const addToCart = action(
			"addToCart",
			1,
			{},
			{ inCart: true },
			async (ctx) =>
				ctx.state["webmcp:add_to_cart:result"] === "ok"
					? { inCart: true }
					: {
							waiting: {
								kind: "webmcp_tool_call",
								payload: { tool: "add_to_cart" },
							},
						},
		);

		const first = await runPlan({
			state: {},
			goal: { inCart: true },
			actions: [addToCart],
			ctx: {},
		});
		expect(first.succeeded).toBe(false);
		expect(first.waiting).toBeDefined();

		const resumed = await runPlan({
			state: { ...first.finalState, "webmcp:add_to_cart:result": "ok" },
			goal: { inCart: true },
			actions: [addToCart],
			ctx: {},
		});
		expect(resumed.succeeded).toBe(true);
		expect(resumed.finalState.inCart).toBe(true);
	});
});

describe("runPlan maxActionFailures", () => {
	test("gives up when the same action keeps finishing without its promised effects", async () => {
		const never: GoapAction = {
			name: "never",
			cost: 1,
			preconditions: {},
			effects: { done: true },
			execute: async () => ({}),
		};
		const result = await runPlan({
			state: {},
			goal: { done: true },
			actions: [never],
			ctx: {},
			maxReplans: 10,
			maxActionFailures: 2,
		});
		expect(result.succeeded).toBe(false);
		expect(result.executedActions).toEqual(["never", "never"]);
	});

	test("is off unless asked for", async () => {
		const never: GoapAction = {
			name: "never",
			cost: 1,
			preconditions: {},
			effects: { done: true },
			execute: async () => ({}),
		};
		const result = await runPlan({
			state: {},
			goal: { done: true },
			actions: [never],
			ctx: {},
			maxReplans: 3,
		});
		expect(result.executedActions).toHaveLength(4);
	});
});

describe("runPlan onStep", () => {
	const described = (
		name: string,
		effects: GoapAction["effects"],
		produce: GoapAction["effects"],
	): GoapAction => ({
		name,
		cost: 1,
		preconditions: {},
		effects,
		execute: async () => produce,
		describe: (state, phase) => `${name}:${phase}:${String(state.n ?? "-")}`,
	});

	test("reports each described action as running, then done, with the state after it", async () => {
		const steps: unknown[] = [];
		await runPlan({
			state: {},
			goal: { a: true },
			actions: [described("A", { a: true }, { a: true, n: 7 })],
			ctx: {},
			onStep: (step) => steps.push(step),
		});
		expect(steps).toEqual([
			{ action: "A", phase: "running", text: "A:running:-" },
			{ action: "A", phase: "done", text: "A:done:7" },
		]);
	});

	test("an action that did not deliver its effects is reported failed", async () => {
		const steps: { phase: string }[] = [];
		await runPlan({
			state: {},
			goal: { a: true },
			actions: [described("A", { a: true }, {})],
			ctx: {},
			maxReplans: 0,
			onStep: (step) => steps.push(step),
		});
		expect(steps.map((step) => step.phase)).toEqual(["running", "failed"]);
	});

	test("an action that throws is reported failed before the error goes on", async () => {
		const steps: { phase: string }[] = [];
		const boom: GoapAction = {
			...described("A", { a: true }, {}),
			execute: async () => {
				throw new Error("boom");
			},
		};
		await expect(
			runPlan({
				state: {},
				goal: { a: true },
				actions: [boom],
				ctx: {},
				onStep: (step) => steps.push(step),
			}),
		).rejects.toThrow("boom");
		expect(steps.map((step) => step.phase)).toEqual(["running", "failed"]);
	});

	test("an action that waits has only announced itself so far", async () => {
		const steps: { phase: string }[] = [];
		const waits: GoapAction = {
			...described("A", { a: true }, {}),
			execute: async () => ({ waiting: { kind: "k", payload: {} } }),
		};
		await runPlan({
			state: {},
			goal: { a: true },
			actions: [waits],
			ctx: {},
			onStep: (step) => steps.push(step),
		});
		expect(steps.map((step) => step.phase)).toEqual(["running"]);
	});

	test("actions without a description are silent, and a throwing listener changes nothing", async () => {
		const silent: GoapAction = {
			name: "S",
			cost: 1,
			preconditions: {},
			effects: { s: true },
			execute: async () => ({ s: true }),
		};
		const result = await runPlan({
			state: {},
			goal: { s: true, a: true },
			actions: [silent, described("A", { a: true }, { a: true })],
			ctx: {},
			onStep: () => {
				throw new Error("listener bug");
			},
		});
		expect(result.succeeded).toBe(true);
	});
});
