import { Logo } from "./icons";
import { h } from "./jsx";

export const Footer = () => (
	<footer>
		<Logo />
		<span>{`© ${new Date().getFullYear()} PleiadesOrchestra · Part of the project Shalotts`}</span>
	</footer>
);
