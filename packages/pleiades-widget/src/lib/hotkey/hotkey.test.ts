import { describe, expect, test } from "bun:test";
import { formatHotkey, keyShortcuts, parseHotkey } from "./hotkey.ts";

const press = (init: Partial<KeyboardEvent>) =>
	({
		key: "",
		code: "",
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		...init,
	}) as KeyboardEvent;

describe("parseHotkey", () => {
	test("mod+j is Ctrl+J or ⌘J, and nothing else", () => {
		const match = parseHotkey("mod+j");
		expect(match?.(press({ key: "j", ctrlKey: true }))).toBe(true);
		expect(match?.(press({ key: "J", metaKey: true }))).toBe(true);
		expect(match?.(press({ key: "j" }))).toBe(false);
		expect(match?.(press({ key: "k", ctrlKey: true }))).toBe(false);
	});

	test("extra modifiers do not match: Ctrl+Shift+J is another shortcut", () => {
		const match = parseHotkey("mod+j");
		expect(match?.(press({ key: "j", ctrlKey: true, shiftKey: true }))).toBe(
			false,
		);
		expect(match?.(press({ key: "j", ctrlKey: true, altKey: true }))).toBe(
			false,
		);
	});

	test("the physical key counts too, so it works on a Russian layout", () => {
		const match = parseHotkey("mod+j");
		expect(match?.(press({ key: "о", code: "KeyJ", ctrlKey: true }))).toBe(
			true,
		);
	});

	test("modifiers can be spelled out and combined, in any order and case", () => {
		const match = parseHotkey("Shift+Ctrl+K");
		expect(match?.(press({ key: "K", ctrlKey: true, shiftKey: true }))).toBe(
			true,
		);
		expect(match?.(press({ key: "k", ctrlKey: true }))).toBe(false);
		const alt = parseHotkey("alt+/");
		expect(alt?.(press({ key: "/", altKey: true }))).toBe(true);
	});

	test("empty, off or a spec with no key means no shortcut", () => {
		expect(parseHotkey("")).toBeUndefined();
		expect(parseHotkey(null)).toBeUndefined();
		expect(parseHotkey("off")).toBeUndefined();
		expect(parseHotkey("mod+")).toBeUndefined();
	});
});

describe("parseHotkey on each platform", () => {
	test("macOS: ⌘J, and Option+M whose typed character is «µ»", () => {
		expect(
			parseHotkey("mod+j")?.(press({ key: "j", code: "KeyJ", metaKey: true })),
		).toBe(true);
		expect(
			parseHotkey("alt+m")?.(press({ key: "µ", code: "KeyM", altKey: true })),
		).toBe(true);
	});

	test("Windows and Linux: Ctrl+J and Alt+M", () => {
		expect(
			parseHotkey("mod+j")?.(press({ key: "j", code: "KeyJ", ctrlKey: true })),
		).toBe(true);
		expect(
			parseHotkey("alt+m")?.(press({ key: "m", code: "KeyM", altKey: true })),
		).toBe(true);
	});

	test("AltGr (Ctrl+Alt on Windows) typing a letter is not Alt+M", () => {
		expect(
			parseHotkey("alt+m")?.(
				press({ key: "ń", code: "KeyM", altKey: true, ctrlKey: true }),
			),
		).toBe(false);
	});

	test("a Latin layout goes by the letter: on AZERTY the physical J position is not J", () => {
		const match = parseHotkey("mod+j");
		// AZERTY: the key labeled J sits at the physical KeyJ spot on QWERTY too, but M and « , » swap.
		expect(
			parseHotkey("alt+m")?.(press({ key: ",", code: "KeyM", altKey: true })),
		).toBe(false);
		expect(
			parseHotkey("alt+m")?.(
				press({ key: "m", code: "Semicolon", altKey: true }),
			),
		).toBe(true);
		expect(match?.(press({ key: "j", code: "KeyJ", ctrlKey: true }))).toBe(
			true,
		);
	});

	test("a non-Latin layout goes by the physical key", () => {
		expect(
			parseHotkey("mod+j")?.(press({ key: "о", code: "KeyJ", ctrlKey: true })),
		).toBe(true);
		expect(
			parseHotkey("alt+m")?.(press({ key: "ь", code: "KeyM", altKey: true })),
		).toBe(true);
	});

	test("an IME composition is never a shortcut", () => {
		expect(
			parseHotkey("mod+j")?.(
				press({
					key: "Process",
					code: "KeyJ",
					ctrlKey: true,
					isComposing: true,
				}),
			),
		).toBe(false);
	});
});

describe("the space key", () => {
	test("mod+shift+space is Ctrl/⌘+Shift+Space, found by the physical key on any layout", () => {
		const match = parseHotkey("mod+shift+space");
		expect(
			match?.(
				press({ key: " ", code: "Space", ctrlKey: true, shiftKey: true }),
			),
		).toBe(true);
		expect(
			match?.(
				press({ key: " ", code: "Space", metaKey: true, shiftKey: true }),
			),
		).toBe(true);
		expect(match?.(press({ key: " ", code: "Space", ctrlKey: true }))).toBe(
			false,
		);
		expect(match?.(press({ key: " ", code: "Space", shiftKey: true }))).toBe(
			false,
		);
	});

	test("it is written as Space", () => {
		expect(formatHotkey("mod+shift+space", false)).toBe("Ctrl+Shift+Space");
		expect(formatHotkey("mod+shift+space", true)).toBe("⌘⇧Space");
		expect(keyShortcuts("mod+shift+space")).toBe(
			"Control+Shift+Space Meta+Shift+Space",
		);
	});
});

describe("formatHotkey", () => {
	test("is written the way the platform writes it", () => {
		expect(formatHotkey("mod+j", false)).toBe("Ctrl+J");
		expect(formatHotkey("mod+j", true)).toBe("⌘J");
		expect(formatHotkey("ctrl+shift+k", false)).toBe("Ctrl+Shift+K");
		expect(formatHotkey("alt+m", true)).toBe("⌥M");
		expect(formatHotkey("alt+m", false)).toBe("Alt+M");
	});

	test("no shortcut, no text", () => {
		expect(formatHotkey("", false)).toBe("");
		expect(formatHotkey("off", false)).toBe("");
		expect(formatHotkey(null, false)).toBe("");
	});
});

describe("keyShortcuts", () => {
	test("is the aria-keyshortcuts value: mod means both Control and Meta", () => {
		expect(keyShortcuts("mod+j")).toBe("Control+J Meta+J");
		expect(keyShortcuts("alt+m")).toBe("Alt+M");
		expect(keyShortcuts("")).toBeUndefined();
	});
});
