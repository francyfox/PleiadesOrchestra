import { describe, expect, test } from "bun:test";
import { bubbleViews, createMessagesModel } from "./messages.model.ts";

describe("bubbleViews", () => {
	test("a bubble is keyed by the message id and carries its text and the role as a class", () => {
		const [user, assistant] = bubbleViews([
			{ id: "u1", role: "user", content: "hi" },
			{ id: "a1", role: "assistant", content: "hello" },
		]);
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

	test("an assistant bubble with no text yet is the typing indicator", () => {
		const [bubble] = bubbleViews([{ id: "a", role: "assistant", content: "" }]);
		expect(bubble?.typing).toBe(true);
		expect(bubble?.cls).toBe("message assistant typing");
	});

	test("an empty message of the visitor is not a typing indicator", () => {
		const [bubble] = bubbleViews([{ id: "u", role: "user", content: "" }]);
		expect(bubble?.typing).toBe(false);
	});

	test("flow lines keep their order and carry the phase as a class", () => {
		const [bubble] = bubbleViews([
			{
				id: "a",
				role: "assistant",
				content: "",
				steps: [
					{ id: "search", phase: "done", text: "Found" },
					{ id: "add", phase: "running", text: "Adding…" },
				],
			},
		]);
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
		model.render([{ id: "a", role: "assistant", content: "x" }]);
		expect(model.messages.map((m) => m.id)).toEqual(["a"]);
		model.render([]);
		expect(model.messages).toEqual([]);
	});
});
