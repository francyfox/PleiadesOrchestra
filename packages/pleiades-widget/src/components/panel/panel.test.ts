import { describe, expect, test } from "bun:test";
import { createPanelModel } from "./panel.model.ts";
import { fillPanel } from "./panel.slot.ts";
import { panelTemplate } from "./panel.template.tsx";

describe("panel", () => {
	test("Escape reports a close", () => {
		let closed = 0;
		const model = createPanelModel({
			heading: "Chat",
			onClose: () => (closed += 1),
		});
		model.onEscape();
		expect(closed).toBe(1);
		expect(model.heading).toBe("Chat");
	});

	test("its children are rendered inside the frame, in order", () => {
		const html = fillPanel(panelTemplate("pl_panel_1"), [
			"<i>one</i>",
			"<i>two</i>",
		]);
		expect(html.indexOf("<i>one</i>")).toBeGreaterThan(
			html.indexOf('x-data="pl_panel_1"'),
		);
		expect(html.indexOf("<i>two</i>")).toBeGreaterThan(
			html.indexOf("<i>one</i>"),
		);
	});

	test("a closed panel starts inert, so it can never take focus", () => {
		expect(panelTemplate("s")).toContain(" inert ");
	});
});
