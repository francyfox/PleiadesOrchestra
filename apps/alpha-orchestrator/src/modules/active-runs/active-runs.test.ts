import { describe, expect, test } from "bun:test";
import type { PlanTraceEvent } from "@repo/core";
import { ActiveRuns } from "./active-runs.ts";

const started: PlanTraceEvent = {
	type: "action_started",
	attempt: 0,
	action: "generateReply",
	at: 5,
};

describe("ActiveRuns", () => {
	test("a run is listed from start to finish, with the events seen so far", () => {
		const active = new ActiveRuns();
		active.start("r", 1);
		expect(active.get("r")).toEqual({ runId: "r", startedAt: 1, events: [] });

		active.push("r", started);
		expect(active.get("r")?.events).toEqual([started]);

		active.finish("r");
		expect(active.get("r")).toBeUndefined();
	});

	test("events of an unknown run are ignored", () => {
		const active = new ActiveRuns();
		active.push("nope", started);
		expect(active.get("nope")).toBeUndefined();
	});

	test("a run keeps at most the newest events — the oldest are dropped", () => {
		const active = new ActiveRuns(3);
		active.start("r", 1);
		for (let i = 0; i < 5; i++) active.push("r", { ...started, at: i });
		expect(active.get("r")?.events.map((event) => event.at)).toEqual([2, 3, 4]);
	});
});
