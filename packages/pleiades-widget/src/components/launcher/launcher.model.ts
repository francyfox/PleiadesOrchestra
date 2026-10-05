import type { Strings } from "@/lib/i18n/i18n.ts";

export interface LauncherOptions {
	s: Strings;
	onToggle: () => void;
}

export function createLauncherModel({ s, onToggle }: LauncherOptions) {
	return {
		open: false,
		get label() {
			return this.open ? s.close : s.open;
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
