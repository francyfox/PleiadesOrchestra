import { describe, expect, test } from "bun:test";
import type { ChatState } from "@/lib/chat/chat.ts";
import { strings } from "@/lib/i18n/i18n.ts";
import { type ComposerOptions, createComposerModel } from "./composer.model.ts";

const s = strings.en;

function setup(overrides: Partial<ComposerOptions> = {}) {
	const calls: string[] = [];
	const model = createComposerModel({
		s,
		placeholder: "Type…",
		maxChars: 100,
		onSend: (text) => calls.push(`send:${text}`),
		onStop: () => calls.push("stop"),
		...overrides,
	});
	return { model, calls };
}

const state = (patch: Partial<ChatState> = {}): ChatState => ({
	messages: [],
	ready: true,
	busy: false,
	connection: "online",
	toolMode: "webmcp",
	available: { webmcp: true, mcp: true },
	noTools: false,
	...patch,
});

describe("composer", () => {
	test("only a forbidden channel or a lost connection locks sending; a request or server error never does", () => {
		const { model } = setup();
		model.draft = "next try";
		for (const error of [
			"request",
			"failed",
			"rate_limited",
			"too_long",
		] as const) {
			model.render(state({ error }));
			expect(model.sendDisabled).toBe(false);
			expect(model.inputDisabled).toBe(false);
		}
		model.render(state({ connection: "offline", error: "network" }));
		expect(model.sendDisabled).toBe(true);
		model.render(state({ error: "forbidden" }));
		expect(model.sendDisabled).toBe(true);
		expect(model.inputDisabled).toBe(true);
	});

	test("sending needs text; whitespace alone is not text", () => {
		const { model } = setup();
		expect(model.sendDisabled).toBe(true);
		model.draft = "   ";
		expect(model.sendDisabled).toBe(true);
		model.draft = "hello";
		expect(model.sendDisabled).toBe(false);
	});

	test("submit sends the text and clears the box", () => {
		const { model, calls } = setup();
		model.draft = "find a laptop";
		model.submit();
		expect(calls).toEqual(["send:find a laptop"]);
		expect(model.draft).toBe("");
	});

	test("after a send the box is handed back to the visitor (the send button disables itself, so focus would be lost)", () => {
		const events: string[] = [];
		const { model } = setup({
			onSend: (text) => events.push(`send:${text}`),
			afterSend: () => events.push("focus"),
		});
		model.draft = "hello";
		model.submit();
		expect(events).toEqual(["send:hello", "focus"]);
	});

	test("an empty box submits nothing", () => {
		const { model, calls } = setup();
		model.submit();
		expect(calls).toEqual([]);
	});

	test("while a reply streams the button is a stop button, and submitting stops", () => {
		const { model, calls } = setup();
		model.render(state({ busy: true }));
		expect(model.sendLabel).toBe(s.stop);
		expect(model.sendClass).toBe("stop");
		expect(model.sendAria).toBe(s.stop);
		expect(model.sendDisabled).toBe(false);
		model.draft = "typed meanwhile";
		model.submit();
		expect(calls).toEqual(["stop"]);
		expect(model.draft).toBe("typed meanwhile");
	});

	test("outside a reply the send button carries no aria-label of its own", () => {
		const { model } = setup();
		expect(model.sendAria).toBeNull();
		expect(model.sendLabel).toBe(s.send);
	});

	test("no usable tool mode blocks sending", () => {
		const { model } = setup();
		model.draft = "hi";
		model.render(state({ noTools: true }));
		expect(model.sendDisabled).toBe(true);
		expect(model.inputDisabled).toBe(true);
	});

	test("forbidden or offline blocks sending, but never the stop button", () => {
		const { model } = setup();
		model.draft = "hi";
		model.render(state({ error: "forbidden" }));
		expect(model.sendDisabled).toBe(true);
		expect(model.inputDisabled).toBe(true);
		model.render(state({ connection: "offline" }));
		expect(model.sendDisabled).toBe(true);
		expect(model.inputDisabled).toBe(false);
		model.render(state({ connection: "offline", busy: true }));
		expect(model.sendDisabled).toBe(false);
	});

	test("Enter sends, Shift+Enter is a new line, and Enter while composing (IME) is left alone", () => {
		const { model, calls } = setup();
		model.draft = "hi";
		const key = (init: Partial<KeyboardEvent>) => {
			let prevented = false;
			model.onKey({
				key: "Enter",
				shiftKey: false,
				isComposing: false,
				preventDefault: () => {
					prevented = true;
				},
				...init,
			} as KeyboardEvent);
			return prevented;
		};
		expect(key({ shiftKey: true })).toBe(false);
		expect(key({ isComposing: true })).toBe(false);
		expect(key({ key: "a" })).toBe(false);
		expect(calls).toEqual([]);
		expect(key({})).toBe(true);
		expect(calls).toEqual(["send:hi"]);
	});
});
