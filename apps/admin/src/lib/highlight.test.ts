import { describe, expect, test } from "bun:test";
import { highlight } from "./highlight";

describe("highlight", () => {
	test("marks HTML tags and attributes as tokens", () => {
		const html = highlight(
			'<pleiades-chat agent-url="https://x.example"></pleiades-chat>',
			"markup",
		);
		expect(html).toContain('class="token tag"');
		expect(html).toContain("attr-name");
		expect(html).toContain("attr-value");
	});

	test("marks shell commands and flags", () => {
		const html = highlight('curl -X POST https://x.example -H "A: b"', "bash");
		expect(html).toContain("token");
		expect(html).toContain("curl");
	});

	test("never lets code become live markup", () => {
		const html = highlight("<script>alert(1)</script>", "markup");
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;");
	});

	test("an unknown language falls back to escaped plain text", () => {
		expect(highlight('<b>"a" & b</b>', "nope")).toBe(
			"&lt;b&gt;&quot;a&quot; &amp; b&lt;/b&gt;",
		);
	});

	test("the text survives highlighting (only wrapped, never changed)", () => {
		const code =
			'<pleiades-chat\n  agent-url="https://x.example"\n></pleiades-chat>';
		const html = highlight(code, "markup");
		const text = html
			.replace(/<[^>]+>/g, "")
			.replaceAll("&lt;", "<")
			.replaceAll("&gt;", ">")
			.replaceAll("&quot;", '"')
			.replaceAll("&amp;", "&");
		expect(text).toBe(code);
	});
});
