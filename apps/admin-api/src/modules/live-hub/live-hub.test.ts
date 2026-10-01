import { describe, expect, test } from "bun:test";
import { createLiveHub, type HubEvent, stableHash } from "./live-hub.ts";

/** Lets pending promise callbacks (a resolved fetch) run. */
const flush = () => Bun.sleep(0);

function harness(payloads: Record<string, unknown> = {}) {
	const timers = new Map<number, () => void>();
	let nextTimer = 1;
	const fetches: string[] = [];
	const state = {
		data: { ...payloads } as Record<string, unknown>,
		failing: new Set<string>(),
	};
	const hub = createLiveHub({
		topics: {
			things: {
				intervalMs: 1000,
				validate: (params) =>
					typeof params === "object" && params !== null && "n" in params,
				fetch: async (params) => {
					const key = JSON.stringify(params);
					fetches.push(key);
					if (state.failing.has(key)) throw new Error("upstream down");
					return state.data[key] ?? { key };
				},
			},
			other: {
				intervalMs: 2000,
				validate: () => true,
				fetch: async () => {
					fetches.push("other");
					return { other: true };
				},
			},
		},
		setInterval: (fn) => {
			const id = nextTimer++;
			timers.set(id, fn);
			return id;
		},
		clearInterval: (id) => {
			timers.delete(id as number);
		},
	});
	const tick = async () => {
		for (const fn of [...timers.values()]) fn();
		await flush();
	};
	const listen = () => {
		const events: HubEvent[] = [];
		return { events, fn: (event: HubEvent) => events.push(event) };
	};
	/** Subscribes and returns the unsubscribe function (the subscription must be accepted). */
	const sub = (
		topic: string,
		params: unknown,
		fn: (event: HubEvent) => void,
	) => {
		const result = hub.subscribe(topic, params, fn);
		if (!result.ok) throw new Error(`refused: ${result.code}`);
		return result.unsubscribe;
	};
	return { hub, timers, fetches, state, tick, listen, sub };
}

describe("stableHash", () => {
	test("does not depend on key order, at any depth", () => {
		expect(stableHash({ a: 1, b: { c: 2, d: [1, { x: 1, y: 2 }] } })).toBe(
			stableHash({ b: { d: [1, { y: 2, x: 1 }], c: 2 }, a: 1 }),
		);
	});

	test("does depend on values and array order", () => {
		expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
		expect(stableHash([1, 2])).not.toBe(stableHash([2, 1]));
	});
});

describe("createLiveHub", () => {
	test("a new subscriber gets the current snapshot once it is fetched", async () => {
		const { hub, listen } = harness();
		const a = listen();
		hub.subscribe("things", { n: 1 }, a.fn);
		expect(a.events).toEqual([]);
		await flush();
		expect(a.events).toEqual([{ type: "data", data: { key: '{"n":1}' } }]);
	});

	test("unchanged data is not sent again on later ticks", async () => {
		const { hub, tick, listen } = harness();
		const a = listen();
		hub.subscribe("things", { n: 1 }, a.fn);
		await flush();
		await tick();
		await tick();
		expect(a.events).toHaveLength(1);
	});

	test("changed data is sent, in the shape the fetch returned", async () => {
		const { hub, tick, listen, state } = harness({ '{"n":1}': { v: 1 } });
		const a = listen();
		hub.subscribe("things", { n: 1 }, a.fn);
		await flush();
		state.data['{"n":1}'] = { v: 2 };
		await tick();
		expect(a.events.map((e) => (e as { data: unknown }).data)).toEqual([
			{ v: 1 },
			{ v: 2 },
		]);
	});

	test("a payload that only reorders keys counts as unchanged", async () => {
		const { hub, tick, listen, state } = harness({
			'{"n":1}': { a: 1, b: 2 },
		});
		const a = listen();
		hub.subscribe("things", { n: 1 }, a.fn);
		await flush();
		state.data['{"n":1}'] = { b: 2, a: 1 };
		await tick();
		expect(a.events).toHaveLength(1);
	});

	test("params with different key order share one group", async () => {
		const { hub, fetches, listen } = harness();
		hub.subscribe("things", { n: 1, z: 2 }, listen().fn);
		hub.subscribe("things", { z: 2, n: 1 }, listen().fn);
		await flush();
		expect(fetches).toHaveLength(1);
	});

	test("two subscribers of one group share ONE fetch per tick", async () => {
		const { hub, fetches, tick, listen } = harness();
		const a = listen();
		const b = listen();
		hub.subscribe("things", { n: 1 }, a.fn);
		hub.subscribe("things", { n: 1 }, b.fn);
		await flush();
		fetches.length = 0;
		await tick();
		expect(fetches).toHaveLength(1);
	});

	test("different params or topics are different groups with their own fetches and timers", async () => {
		const { hub, fetches, timers, listen } = harness();
		hub.subscribe("things", { n: 1 }, listen().fn);
		hub.subscribe("things", { n: 2 }, listen().fn);
		hub.subscribe("other", {}, listen().fn);
		await flush();
		expect(fetches.sort()).toEqual(['{"n":1}', '{"n":2}', "other"].sort());
		expect(timers.size).toBe(3);
	});

	test("a late subscriber gets the cached snapshot without waiting for a tick or a fetch", async () => {
		const { hub, fetches, listen } = harness();
		hub.subscribe("things", { n: 1 }, listen().fn);
		await flush();
		fetches.length = 0;
		const late = listen();
		hub.subscribe("things", { n: 1 }, late.fn);
		expect(late.events).toEqual([{ type: "data", data: { key: '{"n":1}' } }]);
		await flush();
		expect(fetches).toHaveLength(0);
	});

	test("a subscriber that joined while the first fetch was still running is served by it", async () => {
		const { hub, fetches, listen } = harness();
		const a = listen();
		const b = listen();
		hub.subscribe("things", { n: 1 }, a.fn);
		hub.subscribe("things", { n: 1 }, b.fn);
		await flush();
		expect(fetches).toHaveLength(1);
		expect(a.events).toHaveLength(1);
		expect(b.events).toHaveLength(1);
	});

	test("the timer stops after the last unsubscribe, and a group restarts cleanly", async () => {
		const { timers, fetches, listen, hub, sub } = harness();
		const off1 = sub("things", { n: 1 }, listen().fn);
		const off2 = sub("things", { n: 1 }, listen().fn);
		await flush();
		expect(timers.size).toBe(1);
		off1();
		expect(timers.size).toBe(1);
		off2();
		expect(timers.size).toBe(0);
		fetches.length = 0;
		const again = listen();
		hub.subscribe("things", { n: 1 }, again.fn);
		await flush();
		expect(fetches).toHaveLength(1);
		expect(again.events).toHaveLength(1);
	});

	test("an unsubscribed listener hears nothing more", async () => {
		const { tick, listen, state, sub } = harness({ '{"n":1}': { v: 1 } });
		const a = listen();
		const off = sub("things", { n: 1 }, a.fn);
		await flush();
		off();
		state.data['{"n":1}'] = { v: 2 };
		await tick();
		expect(a.events).toHaveLength(1);
	});

	test("an upstream failure is reported once per outage, then data returns silently on recovery", async () => {
		const { hub, tick, listen, state } = harness({ '{"n":1}': { v: 1 } });
		const a = listen();
		hub.subscribe("things", { n: 1 }, a.fn);
		await flush();
		state.failing.add('{"n":1}');
		await tick();
		await tick();
		await tick();
		expect(a.events.map((e) => e.type)).toEqual(["data", "error"]);
		expect(a.events[1]).toEqual({ type: "error", code: "upstream" });
		state.failing.delete('{"n":1}');
		await tick();
		// Same payload as before the outage, but the client may be stale: it is sent again.
		expect(a.events.map((e) => e.type)).toEqual(["data", "error", "data"]);
		await tick();
		expect(a.events).toHaveLength(3);
	});

	test("one group failing does not disturb another", async () => {
		const { hub, tick, listen, state } = harness({
			'{"n":1}': { v: 1 },
			'{"n":2}': { v: 1 },
		});
		const bad = listen();
		const good = listen();
		hub.subscribe("things", { n: 1 }, bad.fn);
		hub.subscribe("things", { n: 2 }, good.fn);
		await flush();
		state.failing.add('{"n":1}');
		state.data['{"n":2}'] = { v: 2 };
		await tick();
		expect(bad.events.at(-1)).toEqual({ type: "error", code: "upstream" });
		expect(good.events.at(-1)).toEqual({ type: "data", data: { v: 2 } });
	});

	test("a subscriber that joins during an outage is told, and served on recovery", async () => {
		const { hub, tick, listen, state } = harness();
		state.failing.add('{"n":1}');
		const first = listen();
		hub.subscribe("things", { n: 1 }, first.fn);
		await flush();
		const joiner = listen();
		hub.subscribe("things", { n: 1 }, joiner.fn);
		expect(joiner.events).toEqual([{ type: "error", code: "upstream" }]);
		state.failing.delete('{"n":1}');
		await tick();
		expect(first.events.at(-1)?.type).toBe("data");
		expect(joiner.events.at(-1)?.type).toBe("data");
	});

	test("a slow fetch is not started twice", async () => {
		let release: (() => void) | undefined;
		let calls = 0;
		const timers: (() => void)[] = [];
		const hub = createLiveHub({
			topics: {
				slow: {
					intervalMs: 10,
					validate: () => true,
					fetch: () => {
						calls++;
						return new Promise((resolve) => {
							release = () => resolve({ ok: true });
						});
					},
				},
			},
			setInterval: (fn) => {
				timers.push(fn);
				return 1;
			},
			clearInterval: () => {},
		});
		hub.subscribe("slow", {}, () => {});
		timers[0]?.();
		timers[0]?.();
		expect(calls).toBe(1);
		release?.();
		await flush();
		timers[0]?.();
		expect(calls).toBe(2);
	});

	test("an unknown topic or invalid params are refused, and nothing is fetched", async () => {
		const { hub, fetches, timers, listen } = harness();
		expect(hub.subscribe("nope", {}, listen().fn)).toEqual({
			ok: false,
			code: "unknown_topic",
		});
		expect(hub.subscribe("things", "not an object", listen().fn)).toEqual({
			ok: false,
			code: "invalid_params",
		});
		await flush();
		expect(fetches).toHaveLength(0);
		expect(timers.size).toBe(0);
	});
});
