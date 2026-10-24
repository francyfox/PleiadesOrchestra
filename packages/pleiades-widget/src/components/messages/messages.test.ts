import { describe, expect, test } from "bun:test";
import { bubbleViews, createMessagesModel } from "./messages.model.ts";

describe("bubbleViews", () => {
	test("a bubble is keyed by the message id and carries its text and the role as a class", () => {
		const [user, assistant] = bubbleViews(
			[
				{ id: "u1", role: "user", content: "hi" },
				{ id: "a1", role: "assistant", content: "hello" },
			],
			false,
		);
		expect(user).toMatchObject({
			id: "u1",
			cls: "message user",
			content: "hi",
			typing: false,
		});
		expect(assistant).toMatchObject({
			id: "a1",
			cls: "message assistant",
			typing: false,
		});
	});

	test("an assistant bubble with no text yet is the typing indicator while the reply is being made", () => {
		const [bubble] = bubbleViews(
			[{ id: "a", role: "assistant", content: "" }],
			true,
		);
		expect(bubble?.typing).toBe(true);
		expect(bubble?.cls).toBe("message assistant typing");
	});

	test("once the reply is over the dots are gone — a task that failed leaves its flow lines, not a bubble that seems to be still typing", () => {
		const [bubble] = bubbleViews(
			[
				{
					id: "a",
					role: "assistant",
					content: "",
					steps: [{ id: "s", phase: "failed", text: "Nothing found" }],
				},
			],
			false,
		);
		expect(bubble?.typing).toBe(false);
		expect(bubble?.cls).toBe("message assistant");
		expect(bubble?.steps).toHaveLength(1);
	});

	test("only the newest bubble can be typing", () => {
		const [old, newest] = bubbleViews(
			[
				{ id: "a1", role: "assistant", content: "" },
				{ id: "a2", role: "assistant", content: "" },
			],
			true,
		);
		expect(old?.typing).toBe(false);
		expect(newest?.typing).toBe(true);
	});

	test("an empty message of the visitor is not a typing indicator", () => {
		const [bubble] = bubbleViews(
			[{ id: "u", role: "user", content: "" }],
			true,
		);
		expect(bubble?.typing).toBe(false);
	});

	test("flow lines keep their order and carry the phase as a class", () => {
		const [bubble] = bubbleViews(
			[
				{
					id: "a",
					role: "assistant",
					content: "",
					steps: [
						{ id: "search", phase: "done", text: "Found" },
						{ id: "add", phase: "running", text: "Adding…" },
					],
				},
			],
			true,
		);
		expect(bubble?.steps).toEqual([
			{ id: "search", cls: "step done", text: "Found" },
			{ id: "add", cls: "step running", text: "Adding…" },
		]);
	});
});

describe("messages model", () => {
	test("it shows the greeting and the messages it was given", () => {
		const model = createMessagesModel("Hello!");
		expect(model.greeting).toBe("Hello!");
		model.render([{ id: "a", role: "assistant", content: "x" }], false);
		expect(model.messages.map((m) => m.id)).toEqual(["a"]);
		model.render([], false);
		expect(model.messages).toEqual([]);
	});
});

describe("examples", () => {
	const ex = ["a", "b"];

	test("they show while nobody has written anything, then give way to the conversation", () => {
		const model = createMessagesModel("Hi", { examples: ex });
		expect(model.showExamples).toBe(true);
		model.render([{ id: "u", role: "user", content: "hello" }], false);
		expect(model.showExamples).toBe(false);
	});

	test("an assistant greeting from history alone does not hide them", () => {
		const model = createMessagesModel("Hi", { examples: ex });
		model.render([{ id: "a", role: "assistant", content: "hello" }], false);
		expect(model.showExamples).toBe(true);
	});

	test("no examples, nothing to show", () => {
		expect(createMessagesModel("Hi").showExamples).toBe(false);
		expect(createMessagesModel("Hi", { examples: [] }).showExamples).toBe(
			false,
		);
	});

	test("a click asks the example's own text", () => {
		const asked: string[] = [];
		const model = createMessagesModel("Hi", {
			examples: ex,
			onAsk: (text) => asked.push(text),
		});
		model.ask({
			currentTarget: { dataset: { example: "b" } },
		} as unknown as Event);
		expect(asked).toEqual(["b"]);
	});
});

describe("message times", () => {
	const now = new Date(2026, 9, 24, 15, 30).getTime();
	const clock = { lang: "ru" as const, justNow: "только что", now };

	test("a message with a time carries the label, ISO form and exact title", () => {
		const [bubble] = bubbleViews(
			[{ id: "u", role: "user", content: "hi", createdAt: now - 5 * 60_000 }],
			false,
			clock,
		);
		expect(bubble).toMatchObject({
			time: "5 мин",
			iso: new Date(now - 5 * 60_000).toISOString(),
		});
		expect(bubble?.title).toContain("2026");
	});

	test("no time without a createdAt, and none on the typing bubble", () => {
		const views = bubbleViews(
			[
				{ id: "u", role: "user", content: "hi" },
				{ id: "a", role: "assistant", content: "", createdAt: now },
			],
			true,
			clock,
		);
		expect(views.map((v) => v.time)).toEqual(["", ""]);
	});

	test("refresh redraws the relative times against the new clock", () => {
		let t = now;
		const model = createMessagesModel("Hi", { lang: "en", now: () => t });
		model.render(
			[{ id: "u", role: "user", content: "x", createdAt: now }],
			false,
		);
		expect(model.messages[0]?.time).toBe("just now");
		t = now + 3 * 60_000;
		model.refresh();
		expect(model.messages[0]?.time).toBe("3m");
	});
});
