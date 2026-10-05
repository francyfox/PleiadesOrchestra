import type { Strings } from "@/lib/i18n/i18n.ts";

export interface HeaderOptions {
	s: Strings;
	heading: string;
	onClose: () => void;
}

export function createHeaderModel({ s, heading, onClose }: HeaderOptions) {
	return {
		s,
		heading,
		close() {
			onClose();
		},
	};
}
