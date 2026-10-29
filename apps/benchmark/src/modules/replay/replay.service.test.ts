import { expect, test } from "bun:test";
import {
	groupByModel,
	replayedLatency,
	sameArguments,
} from "./replay.service.ts";
import type { RecordedRun } from "./replay.types.ts";

const run = (id: string, calls: RecordedRun["detail"]["llmCalls"]) =>
	({
		id,
		ok: true,
		latencyMs: 3000,
		detail: { llmCalls: calls },
	}) as RecordedRun;

const call = (
	model: string,
	latencyMs: number,
	prompt: string | null = "[]",
) => ({
	model,
	latencyMs,
	prompt,
	outputTokens: 5,
});

test("groupByModel: only calls with a prompt, each model's calls together in run order", () => {
	const runs = [
		run("a", [
			call("q", 900),
			call("d3", 100, null),
			call("arch", 1500),
			call("q", 400),
		]),
		run("b", [call("arch", 300)]),
	];
	const groups = groupByModel(runs);
	expect([...groups.keys()]).toEqual(["q", "arch"]);
	expect(groups.get("q")?.map((c) => [c.run, c.index])).toEqual([
		["a", 0],
		["a", 3],
	]);
	expect(groups.get("arch")?.map((c) => [c.run, c.index])).toEqual([
		["a", 2],
		["b", 0],
	]);
});

test("replayedLatency: recorded model time (swaps included) out, warm replay time in, the rest kept", () => {
	const recorded = run("a", [
		call("q", 900),
		call("d3", 100, null),
		call("arch", 1500),
	]);
	// 3000 total = 900 + 100 + 1500 model + 500 code and tools; the replay of q took 600, of arch 350.
	const replayed = new Map([
		["a:0", 600],
		["a:2", 350],
	]);
	expect(replayedLatency(recorded, replayed)).toBe(
		3000 - 900 - 1500 + 600 + 350,
	);
});

test("replayedLatency: a run without a replayed call keeps its time", () => {
	expect(replayedLatency(run("a", [call("d3", 100, null)]), new Map())).toBe(
		3000,
	);
});

test("sameArguments: equal whatever the key order; any other value differs", () => {
	expect(
		sameArguments(
			{ a: 1, b: [{ x: "y", z: 2 }] },
			{ b: [{ z: 2, x: "y" }], a: 1 },
		),
	).toBe(true);
	expect(
		sameArguments({ query: "Shirt" }, { query: "Small Metal Shirt" }),
	).toBe(false);
	expect(sameArguments({ q: 1 }, { q: 1, extra: true })).toBe(false);
	expect(sameArguments(undefined, { q: 1 })).toBe(false);
});
