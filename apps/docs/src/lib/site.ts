// PleiadesOrchestra site constants.
export const SITE = {
	title: "PleiadesOrchestra",
	description:
		"Open-source GOAP orchestrator for tiny models: a website chatbot that works through MCP and WebMCP tools.",
};
/** Public origin: OpenGraph/Twitter need absolute URLs (`og:url`, `og:image`). */
export const SITE_URL = "https://pleiades.shalotts.site";
/** 1200×630 share card (static/og.jpg): the logo, the name and the tagline. */
export const OG_IMAGE = { url: `${SITE_URL}/og.jpg`, width: 1200, height: 630 };

export const PLEIADES_REPO_URL =
	"https://github.com/francyfox/PleiadesOrchestra";
export const PLEIADES_TERMS_URL = `${PLEIADES_REPO_URL}/blob/master/COMMERCIAL-LICENSE.md`;
export const PLEIADES_CONTACT = "francyfox@protonmail.com";
// Polar checkout link of the commercial license. Empty = the landing falls back to a mailto: request
// to PLEIADES_CONTACT. Keep the price text in LandingPricing in sync.
export const PLEIADES_BUY_URL =
	"https://buy.polar.sh/polar_cl_cL84qAaekbAJYEAnR1CTymWEyFvSCwUPyO0hL2mYxnw";
// PLACEHOLDER: replace with the real Polar checkout link of the monthly "Cloud" plan ($20/month).
// Keep the price text in LandingPricing in sync.
export const PLEIADES_CLOUD_CHECKOUT_URL =
	"https://buy.polar.sh/REPLACE_WITH_CLOUD_CHECKOUT_LINK";
