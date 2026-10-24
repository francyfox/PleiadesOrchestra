import { describe, expect, test } from "bun:test";
import { strings } from "@/lib/i18n/i18n.ts";
import { createHeaderModel } from "./header.model.ts";

const make = (picked: string[] = []) => {
	let closed = 0;
	const model = createHeaderModel({
		s: strings.en,
		lang: "en",
		heading: "Shop assistant",
		onClose: () => (closed += 1),
		onLang: (lang) => picked.push(lang),
	});
	return { model, closed: () => closed };
};
const change = (value: string) => ({ target: { value } }) as unknown as Event;

describe("header", () => {
	test("it carries the heading and reports the × click", () => {
		const { model, closed } = make();
		expect(model.heading).toBe("Shop assistant");
		model.close();
		expect(closed()).toBe(1);
	});

	test("choosing a language reports it; a value that is not a widget language is ignored", () => {
		const picked: string[] = [];
		const { model } = make(picked);
		model.pickLang(change("ru"));
		model.pickLang(change("klingon"));
		expect(picked).toEqual(["ru"]);
		expect(model.lang).toBe("en");
	});
});
