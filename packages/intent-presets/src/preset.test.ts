import { describe, expect, test } from "bun:test";
import {
	type IntentPreset,
	intentFromMessageCues,
	intentFromToolNameCues,
	mergePresets,
	tasksConflict,
} from "./preset.ts";

const intent = (description: string, effects = {}) => ({
	description,
	preconditions: {},
	effects,
});

const base: IntentPreset = {
	id: "base",
	sessionFacts: ["store"],
	intents: {
		find: intent("look for things", { found: true }),
		buy: intent("buy it"),
	},
	messageCues: (m) => (m.includes("find") ? "find" : undefined),
	toolCues: (t) => (t.name.startsWith("buy") ? "buy" : undefined),
};

const lamps: IntentPreset = {
	id: "lamps",
	sessionFacts: ["store", "socket"],
	// Redefines `find` whole and adds `dim`.
	intents: {
		find: intent("look for lamps", { lampFound: true }),
		dim: intent("dim it"),
	},
	messageCues: (m) => (m.includes("find") ? "dim" : undefined),
};

describe("mergePresets", () => {
	test("a later preset replaces an intent whole and adds its own; the earlier ones stay", () => {
		const merged = mergePresets([base, lamps]);
		expect(Object.keys(merged.intents).sort()).toEqual(["buy", "dim", "find"]);
		expect(merged.intents.find).toEqual(
			intent("look for lamps", { lampFound: true }),
		);
		expect(merged.presets).toEqual(["base", "lamps"]);
	});

	test("session facts are the union, each once", () => {
		expect(mergePresets([base, lamps]).sessionFacts).toEqual([
			"store",
			"socket",
		]);
	});

	test("the rules of a later preset are asked first, an earlier one answers when it says nothing", () => {
		const merged = mergePresets([base, lamps]);
		expect(intentFromMessageCues(merged, "please find a lamp")).toBe("dim");
		expect(intentFromMessageCues(merged, "hello")).toBeUndefined();
		expect(intentFromToolNameCues(merged, { name: "buy_now" })).toBe("buy");
		expect(intentFromToolNameCues(merged, { name: "zzz" })).toBeUndefined();
	});

	test("no presets is an empty taxonomy, not an error", () => {
		const merged = mergePresets([]);
		expect(merged.intents).toEqual({});
		expect(intentFromMessageCues(merged, "x")).toBeUndefined();
	});
});

describe("tasksConflict", () => {
	const booking = mergePresets([
		{
			id: "booking",
			intents: {
				reserve: intent("reserve"),
				cancel: intent("cancel"),
				pay: intent("pay"),
			},
			taskConflicts: { pairs: [["reserve", "cancel"]], lastOnly: ["pay"] },
		},
	]);

	test("a conflicting pair, in any order", () => {
		expect(tasksConflict(booking, ["reserve", "cancel"])).toBe(true);
		expect(tasksConflict(booking, ["cancel", "x", "reserve"])).toBe(true);
		expect(tasksConflict(booking, ["reserve", "reserve"])).toBe(false);
	});

	test("a last-only intent conflicts unless it is last", () => {
		expect(tasksConflict(booking, ["pay", "reserve"])).toBe(true);
		expect(tasksConflict(booking, ["reserve", "pay"])).toBe(false);
	});

	test("a preset without rules never conflicts", () => {
		expect(tasksConflict(mergePresets([base]), ["find", "buy"])).toBe(false);
	});
});
