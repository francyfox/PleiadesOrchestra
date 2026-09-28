import { describe, expect, test } from "bun:test";
import { createConnectionMonitor, type Problem } from "./connection-monitor";

function harness(delayMs = 2000) {
	const events: [Problem, boolean][] = [];
	const timers = new Map<number, { fn: () => void; ms: number }>();
	let next = 1;
	const monitor = createConnectionMonitor({
		delayMs,
		onChange: (problem, active) => events.push([problem, active]),
		setTimer: (fn, ms) => {
			const id = next++;
			timers.set(id, { fn, ms });
			return id;
		},
		clearTimer: (id) => {
			timers.delete(id as number);
		},
	});
	const elapse = () => {
		for (const [id, timer] of [...timers]) {
			timers.delete(id);
			timer.fn();
		}
	};
	return { monitor, events, timers, elapse };
}

describe("createConnectionMonitor", () => {
	test("a problem is reported only after it has lasted the whole delay", () => {
		const { monitor, events, timers, elapse } = harness(2000);
		monitor.report("socket", "live", true);
		expect(events).toEqual([]);
		expect([...timers.values()].map((timer) => timer.ms)).toEqual([2000]);
		elapse();
		expect(events).toEqual([["socket", true]]);
	});

	test("a short blip (down, then up before the delay) is never reported", () => {
		const { monitor, events, timers, elapse } = harness();
		monitor.report("socket", "live", true);
		monitor.report("socket", "live", false);
		expect(timers.size).toBe(0);
		elapse();
		expect(events).toEqual([]);
	});

	test("recovery of a reported problem is announced at once", () => {
		const { monitor, events, elapse } = harness();
		monitor.report("socket", "live", true);
		elapse();
		monitor.report("socket", "live", false);
		expect(events).toEqual([
			["socket", true],
			["socket", false],
		]);
	});

	test("with several sources the problem lasts until every one is back", () => {
		const { monitor, events, elapse } = harness();
		monitor.report("socket", "live", true);
		monitor.report("socket", "system", true);
		elapse();
		monitor.report("socket", "live", false);
		expect(events).toEqual([["socket", true]]);
		monitor.report("socket", "system", false);
		expect(events).toEqual([
			["socket", true],
			["socket", false],
		]);
	});

	test("reporting the same source down again neither restarts the clock nor repeats the event", () => {
		const { monitor, events, timers, elapse } = harness();
		monitor.report("socket", "live", true);
		monitor.report("socket", "live", true);
		expect(timers.size).toBe(1);
		elapse();
		monitor.report("socket", "live", true);
		expect(events).toEqual([["socket", true]]);
	});

	test("socket and upstream problems are independent", () => {
		const { monitor, events, elapse } = harness();
		monitor.report("upstream", "users", true);
		elapse();
		expect(events).toEqual([["upstream", true]]);
		monitor.report("socket", "live", true);
		elapse();
		monitor.report("upstream", "users", false);
		expect(events).toEqual([
			["upstream", true],
			["socket", true],
			["upstream", false],
		]);
	});

	test("an 'up' nobody was down for says nothing", () => {
		const { monitor, events } = harness();
		monitor.report("socket", "live", false);
		expect(events).toEqual([]);
	});

	test("can go down again after recovering", () => {
		const { monitor, events, elapse } = harness();
		monitor.report("socket", "live", true);
		elapse();
		monitor.report("socket", "live", false);
		monitor.report("socket", "live", true);
		elapse();
		expect(events.map(([, active]) => active)).toEqual([true, false, true]);
	});
});
