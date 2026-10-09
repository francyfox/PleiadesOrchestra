import { LOGO } from "../icons.ts";

/** The branding line. Static: no model, no Alpine scope. */
export const footerTemplate = (year = new Date().getFullYear()) =>
	`<footer>${LOGO}<span>© ${year} 
			<a href="https://shalotts.site/landing/pleiades-orchestra/" target="_blank" rel="noopener noreferrer">PleiadesOrchestra</a> · Part of the project Shalotts</span>
	</footer>`;
