const MODIFIERS = ["ctrl", "meta", "alt", "shift"] as const;
type Modifier = (typeof MODIFIERS)[number];

/**
 * A keyboard shortcut like `mod+j` (also `ctrl+shift+k`, `alt+/`) → a test for
 * a `keydown`. `mod` is Ctrl or ⌘, whichever the person has. Modifiers must
 * match exactly, so Ctrl+Shift+J is not Ctrl+J (which also keeps AltGr, i.e.
 * Ctrl+Alt, from being read as Alt). The letter is matched by what the key
 * typed; when that is not a Latin character (Option+M on a Mac, a Russian
 * layout) the physical key (`KeyJ`) decides, so a shortcut keeps working there.
 * `undefined` = no shortcut (empty, `off`, or no key).
 *
 * The Windows key cannot be used: the OS takes Win+<key> before the browser sees it.
 */
export function parseHotkey(
	spec: string | null | undefined,
): ((event: KeyboardEvent) => boolean) | undefined {
	const parts = spec
		?.toLowerCase()
		.split("+")
		.map((part) => part.trim());
	if (!parts || parts.length === 0 || spec === "off") return undefined;
	const key = parts.pop();
	if (!key || key === "off") return undefined;

	const wanted = new Set<Modifier | "mod">();
	for (const part of parts) {
		if (part === "mod" || MODIFIERS.includes(part as Modifier))
			wanted.add(part as Modifier | "mod");
		else return undefined;
	}
	const code = /^[a-z]$/.test(key)
		? `key${key}`
		: /^[0-9]$/.test(key)
			? `digit${key}`
			: key === "space"
				? "space"
				: undefined;

	return (event) => {
		// Mid-composition (an IME) the keys belong to the input method.
		if (event.isComposing) return false;
		// A Latin layout is trusted for what it typed (AZERTY, Dvorak: the key labeled M is M
		// wherever it sits). Only when the key typed something else — Option+M on a Mac gives
		// «µ», a Russian layout «ь» — does the physical key (`KeyM`) decide.
		const typedLatin = /^[\x21-\x7e]$/.test(event.key);
		const hit =
			code === undefined || typedLatin
				? event.key.toLowerCase() === key
				: event.code.toLowerCase() === code;
		if (!hit) return false;
		const has = (name: Modifier) => event[`${name}Key`];
		if (wanted.has("mod")) {
			if (!(event.ctrlKey || event.metaKey)) return false;
		} else if (
			wanted.has("ctrl") !== event.ctrlKey ||
			wanted.has("meta") !== event.metaKey
		) {
			return false;
		}
		return (
			wanted.has("alt") === has("alt") && wanted.has("shift") === has("shift")
		);
	};
}

const isMac = () =>
	/mac|iphone|ipad/i.test(
		(navigator as { userAgentData?: { platform?: string } }).userAgentData
			?.platform ?? navigator.platform,
	);

/** Splits a spec into its modifiers and key; `undefined` for no shortcut (same rules as `parseHotkey`). */
function split(spec: string | null | undefined) {
	const parts = spec
		?.toLowerCase()
		.split("+")
		.map((part) => part.trim());
	const key = parts?.pop();
	if (!parts || !key || key === "off") return undefined;
	return { modifiers: parts, key };
}

const WORDS: Record<string, string> = {
	mod: "Ctrl",
	ctrl: "Ctrl",
	meta: "Meta",
	alt: "Alt",
	shift: "Shift",
};
const MAC_SIGNS: Record<string, string> = {
	mod: "⌘",
	ctrl: "⌃",
	meta: "⌘",
	alt: "⌥",
	shift: "⇧",
};

const keyName = (key: string) =>
	key === "space" ? "Space" : key.toUpperCase();

/** A shortcut as the platform writes it, for a tooltip: `Ctrl+J`, `⌘J` on a Mac. Empty for no shortcut. */
export function formatHotkey(
	spec: string | null | undefined,
	mac = isMac(),
): string {
	const parsed = split(spec);
	if (!parsed) return "";
	const key = keyName(parsed.key);
	return mac
		? `${parsed.modifiers.map((m) => MAC_SIGNS[m] ?? m).join("")}${key}`
		: [...parsed.modifiers.map((m) => WORDS[m] ?? m), key].join("+");
}

/** The `aria-keyshortcuts` value for a shortcut: `mod` stands for both Control and Meta. */
export function keyShortcuts(
	spec: string | null | undefined,
): string | undefined {
	const parsed = split(spec);
	if (!parsed) return undefined;
	const name = (m: string) =>
		m === "ctrl"
			? "Control"
			: m === "meta"
				? "Meta"
				: m === "alt"
					? "Alt"
					: "Shift";
	const key = keyName(parsed.key);
	const withMod = (replacement: string) =>
		[
			...parsed.modifiers.map((m) => (m === "mod" ? replacement : name(m))),
			key,
		].join("+");
	return parsed.modifiers.includes("mod")
		? `${withMod("Control")} ${withMod("Meta")}`
		: withMod("");
}
