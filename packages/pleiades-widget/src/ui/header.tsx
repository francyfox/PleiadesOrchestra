import { h } from "./jsx";

export const Header = ({
	heading,
	closeLabel,
	onClose,
}: {
	heading: string;
	closeLabel: string;
	onClose: () => void;
}) => (
	<header>
		<b>{heading}</b>
		<button type="button" class="x" aria-label={closeLabel} onClick={onClose}>
			×
		</button>
	</header>
);
