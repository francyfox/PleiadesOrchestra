import { describe, expect, test } from "bun:test";
import { pruneUnproducibleFacts } from "./catalog.ts";
import type { GoapAction } from "./types.ts";

const action = (
	name: string,
	preconditions: GoapAction["preconditions"],
	effects: GoapAction["effects"],
): GoapAction => ({
	name,
	cost: 1,
	preconditions,
	effects,
	execute: async () => ({}),
});

describe("pruneUnproducibleFacts", () => {
	test("drops a precondition nothing can produce and keeps the rest", () => {
		const search = action(
			"search",
			{ storeOpen: true, requestParsed: true },
			{ found: true },
		);
		const parse = action("parse", {}, { requestParsed: true });
		const [prunedSearch] = pruneUnproducibleFacts([search, parse]);
		expect(prunedSearch?.preconditions).toEqual({ requestParsed: true });
	});

	test("keeps preconditions the caller says are always true", () => {
		const search = action("search", { storeOpen: true }, { found: true });
		expect(
			pruneUnproducibleFacts([search], ["storeOpen"])[0]?.preconditions,
		).toEqual({
			storeOpen: true,
		});
	});

	test("returns the same object when nothing changes and never mutates the input", () => {
		const choose = action("choose", {}, { storeOpen: true });
		const search = action("search", { storeOpen: true }, { found: true });
		const result = pruneUnproducibleFacts([choose, search]);
		expect(result[1]).toBe(search);

		const lonely = action("lonely", { ghost: true }, { x: true });
		pruneUnproducibleFacts([lonely]);
		expect(lonely.preconditions).toEqual({ ghost: true });
	});
});
