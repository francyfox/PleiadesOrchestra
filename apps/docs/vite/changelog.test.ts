import { expect, test } from "bun:test";
import { type Release, renderChangelog } from "./changelog.ts";

const rel = (over: Partial<Release>): Release => ({
	tag_name: "v1.0.0",
	name: null,
	body: "",
	published_at: "2026-11-01T10:00:00Z",
	draft: false,
	prerelease: false,
	...over,
});

test("keeps only stack releases, escapes Svelte syntax, nests headings", () => {
	const out = renderChangelog([
		rel({ body: "## What's Changed\n* fix: {x} <b> by @a" }),
		rel({ tag_name: "widget-v0.5.1" }),
		rel({ tag_name: "docs", prerelease: true }),
	]);
	expect(out).toContain("## v1.0.0 (2026-11-01)");
	expect(out).toContain("### What's Changed");
	expect(out).toContain("&#123;x&#125; &lt;b>");
	expect(out).not.toContain("widget-v0.5.1");
	expect(out).not.toContain("## docs");
});
