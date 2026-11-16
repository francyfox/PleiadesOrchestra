// Single sources of truth for the plugin's texts: the widget's dictionary (i18n.ts) and the PHP strings.
import { Glob } from "bun";
import {
	LANG_NAMES,
	strings,
} from "../../pleiades-widget/src/lib/i18n/i18n.ts";

const plugin = "pleiades-chat";
export const widgetI18nPath = `${plugin}/includes/widget-i18n.json`;
export const potPath = `${plugin}/languages/${plugin}.pot`;

/** What PHP reads to offer every language and text the widget supports. */
export const widgetI18n = () =>
	`${JSON.stringify({ langs: LANG_NAMES, strings }, null, "\t")}\n`;

/** Every `__('…', 'pleiades-chat')`-style literal in the PHP files, in file order. */
export async function phpMsgids(): Promise<string[]> {
	const ids = new Set<string>();
	const re =
		/\b_[_ex]\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'pleiades-chat'|\besc_(?:html|attr)_[_e]\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'pleiades-chat'/g;
	for (const f of [...new Glob(`${plugin}/**/*.php`).scanSync()].sort()) {
		for (const m of (await Bun.file(f).text()).matchAll(re))
			ids.add((m[1] ?? m[2] ?? "").replace(/\\'/g, "'"));
	}
	return [...ids];
}

const q = (s: string) => JSON.stringify(s);

export function pot(ids: string[]) {
	return `${[
		`msgid ""\nmsgstr ""\n"Project-Id-Version: Pleiades Chat\\n"\n"Content-Type: text/plain; charset=UTF-8\\n"\n"Language: \\n"`,
		...ids.map((id) => `msgid ${q(id)}\nmsgstr ""`),
	].join("\n\n")}\n`;
}
