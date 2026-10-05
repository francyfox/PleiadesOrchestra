import { describe, expect, test } from "bun:test";
import type { ToolMode } from "@/lib/chat/chat.ts";
import { strings } from "@/lib/i18n/i18n.ts";
import { createModeSwitchModel } from "./mode-switch.model.ts";

describe("mode switch", () => {
	test("the picked mode follows the chat's state", () => {
		const model = createModeSwitchModel({ s: strings.en, onChange: () => {} });
		expect(model.isWebmcp).toBe(true);
		model.render("mcp");
		expect(model.isWebmcp).toBe(false);
		expect(model.isMcp).toBe(true);
	});

	test("a pick is reported with the radio's value", () => {
		const picked: ToolMode[] = [];
		const model = createModeSwitchModel({
			s: strings.en,
			onChange: (mode) => picked.push(mode),
		});
		model.pickMode({ target: { value: "mcp" } } as unknown as Event);
		model.pickMode({ target: { value: "webmcp" } } as unknown as Event);
		expect(picked).toEqual(["mcp", "webmcp"]);
	});
});
