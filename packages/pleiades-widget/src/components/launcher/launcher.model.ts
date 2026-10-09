import type { Strings } from "@/lib/i18n/i18n.ts";

export interface LauncherOptions {
	s: Strings;
	onToggle: () => void;
	/** The shortcut as written for a tooltip (`Ctrl+J`); none when there is no shortcut. */
	shortcut?: string;
	/** The same as an `aria-keyshortcuts` value. */
	keyshortcuts?: string;
}

export function createLauncherModel({
	s,
	onToggle,
	shortcut,
	keyshortcuts,
}: LauncherOptions) {
	return {
		keyshortcuts,
		open: false,
		get label() {
			return this.open ? s.close : s.open;
		},
		/** The tooltip: what a click does, and the key that does it too. */
		get title() {
			return shortcut ? `${this.label} (${shortcut})` : this.label;
		},
		get expanded() {
			return String(this.open);
		},
		toggle() {
			onToggle();
		},
	};
}

export type LauncherModel = ReturnType<typeof createLauncherModel>;
