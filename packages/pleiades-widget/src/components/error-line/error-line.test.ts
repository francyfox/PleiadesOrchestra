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

	test("a request error shows the site's advice after its own sentence; a lost connection never does", () => {
		const model = createErrorLineModel(s);
		model.render("request", "Try a broader word.");
		expect(model.text).toBe(`${s.request} Try a broader word.`);
		model.render("request");
		expect(model.text).toBe(s.request);
		model.render("network", "ignored");
		expect(model.text).toBe(s.network);
		expect(s.request).not.toBe(s.network);
		expect(s.request).not.toBe(s.failed);
	});

	test("every kind of error has a text", () => {
		const model = createErrorLineModel(s);
		for (const error of [
			"forbidden",
			"rate_limited",
			"too_long",
			"network",
			"failed",
			"request",
		] as const) {
			model.render(error);
			expect(model.text).not.toBe("");
		}
	});
});
