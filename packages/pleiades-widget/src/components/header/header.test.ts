import { describe, expect, test } from "bun:test";
import { strings } from "@/lib/i18n/i18n.ts";
import { createHeaderModel } from "./header.model.ts";

describe("header", () => {
	test("it carries the heading and reports the × click", () => {
		let closed = 0;
		const model = createHeaderModel({
			s: strings.en,
			heading: "Shop assistant",
			onClose: () => (closed += 1),
		});
		expect(model.heading).toBe("Shop assistant");
		model.close();
		expect(closed).toBe(1);
	});
});
