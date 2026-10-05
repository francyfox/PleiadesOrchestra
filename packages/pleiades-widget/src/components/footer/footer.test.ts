import { describe, expect, test } from "bun:test";
import { footerTemplate } from "./footer.template.ts";

describe("footer", () => {
	test("it names the project and the year it was made in", () => {
		const html = footerTemplate(2031);
		expect(html).toContain("© 2031 PleiadesOrchestra");
		expect(html).toStartWith("<footer>");
	});

	test("it carries no Alpine directive: nothing in it is dynamic", () => {
		expect(footerTemplate()).not.toContain("x-");
	});
});
