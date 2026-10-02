import { h } from "src/components/jsx.ts";

export const Header = ({
	heading,
	closeLabel,
	onClose,
}: {
	heading: string;
	closeLabel: string;
	onClose: () => void;
}) => (
	<header part="header">
		<b>{heading}</b>
		<button
			type="button"
			class="close"
			part="close"
			aria-label={closeLabel}
			onClick={onClose}
		>
			×
		</button>
	</header>
);
