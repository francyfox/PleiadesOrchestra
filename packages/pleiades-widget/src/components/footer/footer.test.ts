import { describe, expect, test } from "bun:test";
import { footerTemplate } from "./footer.template.ts";

/** What a reader sees: tags gone, runs of whitespace collapsed. */
const text = (html: string) =>
	html
		.replace(/<[^>]*>/g, "")
		.replace(/\s+/g, " ")
		.trim();

describe("footer", () => {
	test("it names the project and the year it was made in", () => {
		const html = footerTemplate(2031);
		expect(text(html)).toContain("© 2031 PleiadesOrchestra");
		expect(html).toStartWith("<footer>");
	});

	test("the project name is a link that opens in a new tab without handing over the opener", () => {
		const link = footerTemplate().match(/<a\s[^>]*>([^<]*)<\/a>/);
		expect(link?.[1]).toBe("PleiadesOrchestra");
		expect(link?.[0]).toMatch(/href="https:\/\/[^"]+"/);
		expect(link?.[0]).toContain('target="_blank"');
		expect(link?.[0]).toContain('rel="noopener noreferrer"');
	});

	test("it carries no Alpine directive: nothing in it is dynamic", () => {
		expect(footerTemplate()).not.toContain("x-");
	});
});
