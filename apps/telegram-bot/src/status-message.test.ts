import { describe, expect, test } from "bun:test";
import { renderStatusText } from "./status-message.ts";

describe("renderStatusText", () => {
	test("shows a bare animation frame before any progress arrives", () => {
		expect(renderStatusText(0, null)).toBe("Думаю.");
		expect(renderStatusText(1, null)).toBe("Думаю..");
		expect(renderStatusText(2, null)).toBe("Думаю...");
	});

	test("cycles the animation frame back to the start", () => {
		expect(renderStatusText(3, null)).toBe("Думаю.");
		expect(renderStatusText(4, null)).toBe("Думаю..");
	});

	test("includes chunk progress, elapsed time, and context size once progress arrives", () => {
		const text = renderStatusText(0, {
			chunkIndex: 1,
			totalChunks: 4,
			elapsedMs: 3456,
			contextChars: 812,
		});

		expect(text).toBe("Думаю.\nЧасть 2/4 · 3.5с · 812 симв. контекста");
	});

	test("chunkIndex is rendered 1-based", () => {
		const text = renderStatusText(0, {
			chunkIndex: 0,
			totalChunks: 1,
			elapsedMs: 0,
			contextChars: 0,
		});

		expect(text).toBe("Думаю.\nЧасть 1/1 · 0.0с · 0 симв. контекста");
	});
});
