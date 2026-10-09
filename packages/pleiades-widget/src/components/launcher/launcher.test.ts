import { describe, expect, test } from "bun:test";
import { strings } from "@/lib/i18n/i18n.ts";
import { createLauncherModel } from "./launcher.model.ts";

const s = strings.en;

describe("launcher", () => {
	test("its label and expanded state follow open/closed", () => {
		const model = createLauncherModel({ s, onToggle: () => {} });
		expect(model.label).toBe(s.open);
		expect(model.expanded).toBe("false");
		model.open = true;
		expect(model.label).toBe(s.close);
		expect(model.expanded).toBe("true");
	});

	test("a click is reported", () => {
		let toggled = 0;
		const model = createLauncherModel({ s, onToggle: () => (toggled += 1) });
		model.toggle();
		expect(toggled).toBe(1);
	});

	test("its tooltip names the shortcut, when there is one", () => {
		const model = createLauncherModel({
			s,
			onToggle: () => {},
			shortcut: "Ctrl+J",
		});
		expect(model.title).toBe(`${s.open} (Ctrl+J)`);
		model.open = true;
		expect(model.title).toBe(`${s.close} (Ctrl+J)`);
		expect(createLauncherModel({ s, onToggle: () => {} }).title).toBe(s.open);
	});
});
