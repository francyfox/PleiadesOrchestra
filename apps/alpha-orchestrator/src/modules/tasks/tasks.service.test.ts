import { expect, test } from "bun:test";
import { chainFacts, progressOf, TASKS_STARTED_FACT } from "./tasks.service.ts";

const task = (text: string) => ({ intent: "addToCart", text });
const done = (text: string) => ({ ...task(text), ok: true });

test("a single task has no progress", () => {
	expect(progressOf({ userMessageEn: "buy cheese" }, false)).toBeUndefined();
	expect(progressOf({ userMessageEn: "buy cheese" }, true)).toBeUndefined();
});

test("the first task of a queue starts at 0 of total", () => {
	const state = {
		userMessageEn: "add milk",
		[TASKS_STARTED_FACT]: 1000,
		...chainFacts([task("show cart")], []),
	};
	expect(progressOf(state, false)).toEqual({
		type: "progress",
		done: 0,
		total: 2,
		current: "add milk",
		startedAt: 1000,
	});
});

test("the last task counts itself once finished", () => {
	const state = {
		userMessageEn: "show cart",
		[TASKS_STARTED_FACT]: 1000,
		...chainFacts([], [done("add milk")]),
	};
	expect(progressOf(state, false)).toMatchObject({ done: 1, total: 2 });
	expect(progressOf(state, true)).toMatchObject({ done: 2, total: 2 });
});
