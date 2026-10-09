import { describe, expect, test } from "bun:test";
import type { ToolMode } from "@/lib/chat/chat.ts";
import { strings } from "@/lib/i18n/i18n.ts";
import { createModeSwitchModel, WEBMCP_FLAG_URL } from "./mode-switch.model.ts";

describe("mode switch", () => {
	test("the picked mode follows the chat's state", () => {
		const model = createModeSwitchModel({
			s: strings.en,
			onChange: () => {},
			webmcpAvailable: true,
		});
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
			webmcpAvailable: true,
		});
		model.pickMode({ target: { value: "mcp" } } as unknown as Event);
		model.pickMode({ target: { value: "webmcp" } } as unknown as Event);
		expect(picked).toEqual(["mcp", "webmcp"]);
	});

	describe("availability", () => {
		test("WebMCP is disabled without a browser provider, MCP stays available", () => {
			const model = createModeSwitchModel({
				s: strings.en,
				onChange: () => {},
				webmcpAvailable: false,
			});
			expect(model.webmcpDisabled).toBe(true);
			expect(model.mcpDisabled).toBe(false);
		});

		test("both are enabled when available (the default for MCP)", () => {
			const model = createModeSwitchModel({
				s: strings.en,
				onChange: () => {},
				webmcpAvailable: true,
			});
			expect(model.webmcpDisabled).toBe(false);
			expect(model.mcpDisabled).toBe(false);
		});

		test("an unavailable mode can be switched off too", () => {
			const model = createModeSwitchModel({
				s: strings.en,
				onChange: () => {},
				webmcpAvailable: true,
				mcpAvailable: false,
			});
			expect(model.mcpDisabled).toBe(true);
		});
	});

	describe("hint", () => {
		const setup = () => {
			let listener: ((event: Event) => void) | undefined;
			let removed = 0;
			const root = {};
			const model = createModeSwitchModel({
				s: strings.en,
				webmcpAvailable: true,
				onChange: () => {},
				clicks: (handler) => {
					listener = handler;
					return () => {
						listener = undefined;
						removed++;
					};
				},
			});
			const clickHint = () =>
				model.toggleHint({
					currentTarget: { closest: () => root },
				} as unknown as Event);
			const click = (inside: boolean) =>
				listener?.({
					composedPath: () => (inside ? [root] : []),
				} as unknown as Event);
			return {
				model,
				clickHint,
				click,
				removed: () => removed,
				listening: () => !!listener,
			};
		};

		test("a click on the question mark opens it, another closes it", () => {
			const { model, clickHint } = setup();
			expect(model.hintOpen).toBe(false);
			clickHint();
			expect(model.hintOpen).toBe(true);
			clickHint();
			expect(model.hintOpen).toBe(false);
		});

		test("a click outside the switch closes it; one inside does not", () => {
			const { model, clickHint, click } = setup();
			clickHint();
			click(true);
			expect(model.hintOpen).toBe(true);
			click(false);
			expect(model.hintOpen).toBe(false);
		});

		test("listens to the page only while it is open", () => {
			const { clickHint, click, listening, removed } = setup();
			expect(listening()).toBe(false);
			clickHint();
			expect(listening()).toBe(true);
			click(false);
			expect(listening()).toBe(false);
			expect(removed()).toBe(1);
		});

		test("a click on the link copies the address and says so", async () => {
			const copied: string[] = [];
			let prevented = false;
			const model = createModeSwitchModel({
				s: strings.en,
				webmcpAvailable: true,
				onChange: () => {},
				copy: async (text) => {
					copied.push(text);
				},
			});
			expect(model.linkText).toBe(WEBMCP_FLAG_URL);
			await model.copyFlag({
				preventDefault: () => {
					prevented = true;
				},
			} as unknown as Event);
			expect(prevented).toBe(true);
			expect(copied).toEqual([WEBMCP_FLAG_URL]);
			expect(model.linkText).toBe(strings.en.copied);
			model.closeHint();
			expect(model.linkText).toBe(WEBMCP_FLAG_URL);
		});

		test("a failed copy leaves the address as it was", async () => {
			const model = createModeSwitchModel({
				s: strings.en,
				webmcpAvailable: true,
				onChange: () => {},
				copy: async () => {
					throw new Error("denied");
				},
			});
			await model.copyFlag({ preventDefault() {} } as unknown as Event);
			expect(model.linkText).toBe(WEBMCP_FLAG_URL);
		});
	});
});
