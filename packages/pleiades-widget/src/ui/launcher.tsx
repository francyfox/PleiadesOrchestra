import type { Strings } from "../lib/i18n";
import { ChatIcon } from "./icons";
import { h } from "./jsx";

/** The round button in the corner that opens and closes the panel. */
export function Launcher({
	s,
	onToggle,
}: {
	s: Strings;
	onToggle: () => void;
}) {
	const el = (
		<button
			type="button"
			class="fab"
			aria-controls="p"
			aria-expanded="false"
			aria-label={s.open}
			onClick={onToggle}
		>
			<ChatIcon />
		</button>
	) as HTMLButtonElement;

	return {
		el,
		setOpen(open: boolean) {
			el.setAttribute("aria-expanded", String(open));
			el.setAttribute("aria-label", open ? s.close : s.open);
		},
	};
}
