import { describe, expect, test } from "bun:test";
import { strings } from "@/lib/i18n/i18n.ts";
import { createErrorLineModel } from "./error-line.model.ts";

const s = strings.en;

describe("error line", () => {
	test("an error shows its localized text, none shows nothing", () => {
		const model = createErrorLineModel(s);
		expect(model.text).toBe("");
		model.render("network");
		expect(model.text).toBe(s.network);
		model.render(undefined);
		expect(model.text).toBe("");
	});

	test("every kind of error has a text", () => {
		const model = createErrorLineModel(s);
		for (const error of [
			"forbidden",
			"rate_limited",
			"too_long",
			"network",
			"failed",
		] as const) {
			model.render(error);
			expect(model.text).not.toBe("");
		}
	});
});
