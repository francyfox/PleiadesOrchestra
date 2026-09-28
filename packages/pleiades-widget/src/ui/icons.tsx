import { h } from "./jsx";

export const ChatIcon = () => (
	<svg
		viewBox="0 0 24 24"
		width="26"
		height="26"
		fill="currentColor"
		aria-hidden="true"
	>
		<path d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
	</svg>
);

/** The Pleiades mark, redrawn as four rhombi around a dot — the full docs/logo.svg is 23 kB. */
export const Logo = () => (
	<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
		<rect x="7" y="3" width="10" height="18" fill="#111" />
		<g fill="#f0663f" stroke="#111" stroke-width=".7">
			<path d="M12 1l4 5-4 5-4-5zM1 12l5-4 5 4-5 4zM13 12l5-4 5 4-5 4zM12 13l4 5-4 5-4-5z" />
			<circle cx="12" cy="12" r="1.6" />
		</g>
	</svg>
);
