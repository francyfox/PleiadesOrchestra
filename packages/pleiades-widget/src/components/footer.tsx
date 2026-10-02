import { Logo } from "src/components/icons.tsx";
import { h } from "src/components/jsx.ts";

export const Footer = () => (
	<footer>
		<Logo />
		<span>{`© ${new Date().getFullYear()} PleiadesOrchestra · Part of the project Shalotts`}</span>
	</footer>
);
