import { describe, expect, test } from "bun:test";
import {
	buildEmbedSnippet,
	PLACEHOLDER_AGENT_URL,
	PLACEHOLDER_SCRIPT_URL,
} from "./embed-snippet";

const key = "pk_abcdefghijklmnop";

describe("buildEmbedSnippet", () => {
	test("a script tag for the bundle plus the element with the public key and agent URL", () => {
		expect(
			buildEmbedSnippet({
				scriptUrl: "https://cdn.example.com/pleiades-widget.js",
				agentUrl: "https://agent.example.com",
				publishableKey: key,
			}),
		).toBe(
			[
				'<script src="https://cdn.example.com/pleiades-widget.js" defer></script>',
				"<pleiades-chat",
				'  agent-url="https://agent.example.com"',
				`  publishable-key="${key}"`,
				"></pleiades-chat>",
			].join("\n"),
		);
	});

	test("blank URLs become obvious placeholders to replace, never empty attributes", () => {
		const snippet = buildEmbedSnippet({
			scriptUrl: "  ",
			agentUrl: "",
			publishableKey: key,
		});
		expect(snippet).toContain(`src="${PLACEHOLDER_SCRIPT_URL}"`);
		expect(snippet).toContain(`agent-url="${PLACEHOLDER_AGENT_URL}"`);
	});

	test("trims whitespace around the URLs", () => {
		const snippet = buildEmbedSnippet({
			scriptUrl: " https://cdn.example.com/w.js ",
			agentUrl: " https://agent.example.com ",
			publishableKey: key,
		});
		expect(snippet).toContain('src="https://cdn.example.com/w.js"');
		expect(snippet).toContain('agent-url="https://agent.example.com"');
	});

	test("escapes what would break out of an attribute", () => {
		const snippet = buildEmbedSnippet({
			scriptUrl: 'https://x.example/"><script>alert(1)</script>',
			agentUrl: "https://a.example/?a=1&b=2",
			publishableKey: key,
		});
		expect(snippet).not.toContain("<script>alert");
		expect(snippet).toContain(
			"&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;",
		);
		expect(snippet).toContain("?a=1&amp;b=2");
	});

	test("refuses to embed a secret key", () => {
		expect(() =>
			buildEmbedSnippet({
				scriptUrl: "",
				agentUrl: "",
				publishableKey: "sk_abcdefghijklmnop",
			}),
		).toThrow("secret");
	});
});
