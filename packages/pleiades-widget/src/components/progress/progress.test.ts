import { describe, expect, test } from "bun:test";
import { strings } from "@/lib/i18n/i18n.ts";
import { createProgressModel, elapsedText } from "./progress.model.ts";

describe("elapsedText", () => {
	test("m:ss, never negative", () => {
		expect(elapsedText(0)).toBe("0:00");
		expect(elapsedText(7_400)).toBe("0:07");
		expect(elapsedText(72_000)).toBe("1:12");
		expect(elapsedText(-5)).toBe("0:00");
	});
});

describe("progress model", () => {
	const s = strings.ru;
	const task = { done: 1, total: 3, current: "show the cart", startedAt: 1000 };

	test("hidden without progress", () => {
		const model = createProgressModel(s);
		model.render(undefined, 5000);
		expect(model.visible).toBe(false);
	});

	test("label, task, live time and the line's width", () => {
		const model = createProgressModel(s);
		model.render(task, 8_000);
		expect(model).toMatchObject({
			visible: true,
			label: "Выполнено 1 из 3",
			elapsed: "0:07",
			current: "show the cart",
			fill: "width:33%",
		});
		model.tick(11_000);
		expect(model.elapsed).toBe("0:10");
	});

	test("an ended turn freezes at its final time and ignores ticks", () => {
		const model = createProgressModel(s);
		model.render({ ...task, done: 3, endedAt: 13_000 }, 99_000);
		expect(model.elapsed).toBe("0:12");
		expect(model.fill).toBe("width:100%");
		model.tick(120_000);
		expect(model.elapsed).toBe("0:12");
		expect(model.running).toBe(false);
	});

	test("the screen-reader text changes with done/total only, not with the clock", () => {
		const model = createProgressModel(s);
		model.render(task, 2_000);
		const first = model.announce;
		model.tick(9_000);
		expect(model.announce).toBe(first);
		model.render({ ...task, done: 2 }, 9_000);
		expect(model.announce).toBe("Выполнено 2 из 3");
	});
});
