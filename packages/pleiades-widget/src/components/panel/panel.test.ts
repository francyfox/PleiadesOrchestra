import { describe, expect, test } from "bun:test";
import { createPanelModel } from "./panel.model.ts";
import { panelTemplate } from "./panel.template.ts";

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
		const html = panelTemplate(["<i>one</i>", "<i>two</i>"])("pl_panel_1");
		expect(html.indexOf("<i>one</i>")).toBeGreaterThan(
			html.indexOf('x-data="pl_panel_1"'),
		);
		expect(html.indexOf("<i>two</i>")).toBeGreaterThan(
			html.indexOf("<i>one</i>"),
		);
	});

	test("a closed panel starts inert, so it can never take focus", () => {
		expect(panelTemplate([])("s")).toContain(" inert ");
	});
});
