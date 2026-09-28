import Prism from "prismjs";
import "prismjs/components/prism-bash";

export type CodeLanguage = "markup" | "bash";

const escapeHtml = (text: string) =>
	text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");

/**
 * Prism's HTML for `code`: the text wrapped in `<span class="token …">`,
 * with every `<`, `>` and `&` of the code escaped, so the result is safe for
 * `{@html}`. An unknown language is just escaped text.
 */
export function highlight(code: string, language: string): string {
	const grammar = Prism.languages[language];
	return grammar ? Prism.highlight(code, grammar, language) : escapeHtml(code);
}
