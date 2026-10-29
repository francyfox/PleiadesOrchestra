import { expect, test } from "bun:test";
import {
	bars,
	claims,
	formatMs,
	formatUsd,
	layoutFlow,
	legendOf,
	runOrder,
	statusOf,
	stepMeta,
	summarize,
	totals,
} from "./flow.service.ts";

const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

test("wide: snake of rows of four, hand-off down at the row end", () => {
	const { slots, height } = layoutFlow(ids, false, "d");
	expect(slots.a).toMatchObject({ x: 0, y: 0, out: "right" });
	expect(slots.d).toMatchObject({ x: 780, out: "right" }); // fan owner
	expect(slots.e).toMatchObject({ x: 780, y: 300, in: "top", out: "left" });
	expect(slots.h).toMatchObject({ x: 0, y: 300, out: "bottom" });
	expect(slots.i).toMatchObject({ x: 0, y: 600, in: "top" });
	expect(height).toBe(40);
});

test("narrow: one column, room under the fan owner", () => {
	const { slots, fan } = layoutFlow(ids.slice(0, 5), true, "d");
	expect(slots.d).toMatchObject({ x: 0, y: 480, out: "right" });
	expect(slots.e.y).toBe(800);
	expect(fan).toEqual({ x: 240, y: 410 });
});

test("run order puts the chosen option right after its fan owner", () => {
	const scenario = {
		done: true,
		steps: [{ id: "a" }, { id: "g" }, { id: "b" }],
		fan: { at: "g", options: ["x", "y"] },
	};
	const order = runOrder(scenario);
	expect(order).toEqual(["a", "g", "opt-x", "b"]);
	expect(statusOf(order, 2, "g")).toBe("done");
	expect(statusOf(order, 2, "opt-x")).toBe("active");
	expect(statusOf(order, 2, "b")).toBe("idle");
});

test("totals add time, cost and model calls", () => {
	expect(
		totals([
			{ id: "w" },
			{ id: "m", ms: 400, usd: 0.0001 },
			{ id: "t", ms: 5 },
		]),
	).toEqual({ ms: 405, usd: 0.0001, calls: 1 });
});

test("legend: the run's time, price and model calls", () => {
	expect(
		legendOf({
			done: true,
			steps: [
				{ id: "w" },
				{ id: "m", ms: 700, usd: 0.00015 },
				{ id: "c", ms: 3 },
			],
		}),
	).toEqual({ time: "703 ms", cost: "$0.00015", calls: 1 });
});

test("step meta: model, time and price of what was measured", () => {
	expect(
		stepMeta({ id: "d", model: "llama-3.1-8b", ms: 415, usd: 0.0000288 }),
	).toBe("llama-3.1-8b · 415 ms · $0.000029");
	expect(stepMeta({ id: "c", ms: 3 })).toBe("3 ms");
	expect(stepMeta({ id: "w" })).toBe("");
});

test("formats keep the tiny per-call prices readable", () => {
	expect(formatUsd(0.00001464)).toBe("$0.000015");
	expect(formatUsd(0)).toBe("$0");
	expect(formatMs(380)).toBe("380 ms");
	expect(formatMs(0.042)).toBe("42 µs");
	expect(formatMs(3.14)).toBe("3.1 ms");
	expect(formatMs(2660)).toBe("2.66 s");
});

const contenders = [
	{
		name: "orchestra",
		orchestra: true,
		success: 1,
		p50Ms: 2000,
		usdPerSuccess: 0.00015,
	},
	{ name: "small", success: 0.5, p50Ms: 1000, usdPerSuccess: 0.0001 },
	{ name: "big", success: 1, p50Ms: 1000, usdPerSuccess: 0.0002 },
];

test("summary: how many times better and the cost change in percent", () => {
	expect(summarize(contenders[2], contenders[0])).toEqual({
		success: 1,
		speed: 0.5,
		cost: -25,
	});
});

test("claims: only the figures the orchestrator wins, each naming its rival", () => {
	expect(
		claims({ contenders, main: "orchestra", same: "small", bigger: "big" }),
	).toEqual([
		{ key: "success", value: "2×", versus: "small" },
		{ key: "cost", value: "−25%", versus: "big" },
	]);
});

test("bars: best first, width is the share of the largest value", () => {
	const [success, time] = bars(contenders);
	expect(success.rows.map((r) => [r.name, r.label, r.width])).toEqual([
		["orchestra", "100%", 100],
		["big", "100%", 100],
		["small", "50%", 50],
	]);
	expect(time.rows.map((r) => r.name).at(-1)).toBe("orchestra");
	expect(time.rows.at(-1)?.orchestra).toBe(true);
});

test("bars: a contender without a cost is left out of the cost group only", () => {
	const local = { name: "local", success: 1, p50Ms: 900 };
	const [success, , cost] = bars([...contenders, local]);
	expect(success.rows.map((r) => r.name)).toContain("local");
	expect(cost.rows.map((r) => r.name)).not.toContain("local");
});
