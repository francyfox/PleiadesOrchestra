// Single sources of truth for the plugin's texts: the widget's dictionary (i18n.ts) and the PHP strings.
import { Glob } from "bun";
import {
	LANG_NAMES,
	strings,
} from "../../pleiades-widget/src/lib/i18n/i18n.ts";

const plugin = "pleiades-chat";
export const widgetI18nPath = `${plugin}/includes/widget-i18n.json`;
export const potPath = `${plugin}/languages/${plugin}.pot`;
export const poPath = `${plugin}/languages/${plugin}-ru_RU.po`;
export const moPath = `${plugin}/languages/${plugin}-ru_RU.mo`;

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
		`msgid ""\nmsgstr ""\n"Project-Id-Version: Pleiades Assistant\\n"\n"Content-Type: text/plain; charset=UTF-8\\n"\n"Language: \\n"`,
		...ids.map((id) => `msgid ${q(id)}\nmsgstr ""`),
	].join("\n\n")}\n`;
}

/** Parses a .po of single-line msgid/msgstr pairs into a map (header = ""). */
export function parsePo(text: string) {
	const map = new Map<string, string>();
	for (const block of text.split(/\n\s*\n/)) {
		const id = block.match(/^msgid (".*")$/m)?.[1];
		const str = block.match(/^msgstr (".*")$/m)?.[1];
		if (id !== undefined && str !== undefined)
			map.set(JSON.parse(id), JSON.parse(str));
	}
	return map;
}

/** Compiles translations to a gettext .mo (little endian, no hash table). */
export function mo(map: Map<string, string>) {
	const entries = [...map]
		.filter(([id, s]) => s !== "" || id === "")
		.sort(([a], [b]) => (a < b ? -1 : 1));
	const enc = new TextEncoder();
	const ids = entries.map(([id]) => enc.encode(id));
	const strs = entries.map(([, s]) => enc.encode(s));
	const n = entries.length;
	const idsStart = 28;
	const strsStart = idsStart + n * 8;
	let offset = strsStart + n * 8;
	const out: number[] = [];
	const u32 = (v: number) =>
		out.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
	for (const v of [0x950412de, 0, n, idsStart, strsStart, 0, 0]) u32(v);
	const place = (list: Uint8Array[]) =>
		list.map((b) => {
			const o = offset;
			offset += b.length + 1;
			return [b.length, o] as const;
		});
	const idTab = place(ids);
	const strTab = place(strs);
	for (const [l, o] of idTab) {
		u32(l);
		u32(o);
	}
	for (const [l, o] of strTab) {
		u32(l);
		u32(o);
	}
	for (const b of [...ids, ...strs]) out.push(...b, 0);
	return new Uint8Array(out);
}
