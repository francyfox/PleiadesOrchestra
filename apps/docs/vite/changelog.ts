import { existsSync } from "node:fs";
import { join } from "node:path";

const REPO = "francyfox/PleiadesOrchestra";
const OUT = join(import.meta.dir, "../content/en/changelog/overview.md");

export interface Release {
	tag_name: string;
	name: string | null;
	body: string | null;
	published_at: string | null;
	draft: boolean;
	prerelease: boolean;
}

// Markdown is compiled as Svelte: braces and `<` in a commit title would start an expression or a tag.
// shortcut: escaped even inside backticks (shown as the entity there), upgrade if titles need literal braces in code.
const escapeSvelte = (md: string) =>
	md.replace(/\{/g, "&#123;").replace(/\}/g, "&#125;").replace(/</g, "&lt;");

/** Stack releases (`vX.Y.Z`) as a docs page, newest first. The widget and rolling deploy releases are skipped. */
export function renderChangelog(releases: Release[]): string {
	const stack = releases.filter(
		(r) => !r.draft && !r.prerelease && /^v\d/.test(r.tag_name),
	);
	const sections = stack.map((r) => {
		const date = r.published_at?.slice(0, 10) ?? "";
		// The release's own headings sit under the version's H2.
		const body = escapeSvelte((r.body ?? "").trim()).replace(
			/^(#{1,4}) /gm,
			"$1## ",
		);
		return `## ${r.tag_name}${date ? ` (${date})` : ""}\n\n${body}`;
	});
	return `---
title: Changelog
---

# Changelog

Releases of the stack image \`ghcr.io/francyfox/pleiades\`, generated from [GitHub releases](https://github.com/${REPO}/releases).

${sections.join("\n\n") || "No releases yet."}
`;
}

if (import.meta.main) {
	try {
		const res = await fetch(
			`https://api.github.com/repos/${REPO}/releases?per_page=100`,
			{
				headers: {
					accept: "application/vnd.github+json",
					...(process.env.GITHUB_TOKEN && {
						authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
					}),
				},
			},
		);
		if (!res.ok) throw new Error(`GitHub API ${res.status}`);
		await Bun.write(OUT, renderChangelog((await res.json()) as Release[]));
	} catch (error) {
		// Offline dev: keep the last page; a first build still gets a valid one.
		console.warn(`changelog: ${error}`);
		if (!existsSync(OUT)) await Bun.write(OUT, renderChangelog([]));
	}
}
