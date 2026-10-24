import { describe, expect, test } from "bun:test";
import { strings } from "@/lib/i18n/i18n.ts";
import { createNoticeModel } from "./notice.model.ts";

const s = strings.ru;
const calls: string[] = [];
const model = () =>
	createNoticeModel({
		s,
		onContinue: () => calls.push("continue"),
		onCancel: () => calls.push("cancel"),
		onRetry: () => calls.push("retry"),
	});

describe("notice", () => {
	test("hidden without a notice", () => {
		const m = model();
		m.render(undefined);
		expect(m).toMatchObject({ visible: false, asking: false, canRetry: false });
	});

	test("a held call asks Continue / Cancel", () => {
		const m = model();
		m.render({ kind: "resume", tasksLeft: 0 });
		expect(m).toMatchObject({
			visible: true,
			asking: true,
			canRetry: false,
			text: "Прошлый запрос не завершён. Продолжить?",
		});
	});

	test("a lost request says it and, with tasks behind it, how many; Retry only with a prompt", () => {
		const m = model();
		m.render({ kind: "retry", prompt: "купи молоко", tasksLeft: 2 });
		expect(m).toMatchObject({
			asking: false,
			canRetry: true,
			text: "Запрос прервался (осталось задач: 2)",
		});
		m.render({ kind: "retry", prompt: "", tasksLeft: 0 });
		expect(m).toMatchObject({ canRetry: false, text: "Запрос прервался" });
	});

	test("after Cancel: a neutral line in the UI language, no buttons", () => {
		const m = model();
		m.render({ kind: "cancelled" });
		expect(m).toMatchObject({
			visible: true,
			asking: false,
			canRetry: false,
			text: "Запрос отменён. Действие могло уже выполниться — проверьте страницу.",
		});
	});

	test("the buttons call what the widget gave", () => {
		const m = model();
		m.doContinue();
		m.doCancel();
		m.doRetry();
		expect(calls).toEqual(["continue", "cancel", "retry"]);
	});
});
