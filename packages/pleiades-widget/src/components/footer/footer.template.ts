import { LOGO } from "../icons.ts";

/** The branding line. Static: no model, no Alpine scope. */
export const footerTemplate = (year = new Date().getFullYear()) =>
	`<footer>${LOGO}<span>© ${year} PleiadesOrchestra · Part of the project Shalotts</span></footer>`;
