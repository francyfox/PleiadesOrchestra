import { isLang, type Lang, type Strings } from "@/lib/i18n/i18n.ts";

export interface HeaderOptions {
	s: Strings;
	/** The widget's language, selected in the picker. */
	lang: Lang;
	heading: string;
	onClose: () => void;
	/** The visitor picked a language. */
	onLang: (lang: Lang) => void;
}

export function createHeaderModel({
	s,
	lang,
	heading,
	onClose,
	onLang,
}: HeaderOptions) {
	return {
		s,
		lang,
		heading,
		close() {
			onClose();
		},
		/** The native `<select>` changed: it brings the keyboard, the popup and Escape for free. */
		pickLang(event: Event) {
			const value = (event.target as HTMLSelectElement).value;
			if (isLang(value)) onLang(value);
		},
	};
}
