import { DEFAULT_LOCALE, type Locale } from "#lib/i18n.js";
import enAbout from "./locales/en/about.json";
import enBenefits from "./locales/en/benefits.json";
import enCommon from "./locales/en/common.json";
import enFlow from "./locales/en/flow.json";
import enHistory from "./locales/en/history.json";
import enMcp from "./locales/en/mcp.json";
import enNav from "./locales/en/nav.json";
import enPlatforms from "./locales/en/platforms.json";
import enPricing from "./locales/en/pricing.json";
import enResults from "./locales/en/results.json";
import enSecurity from "./locales/en/security.json";
import enSeo from "./locales/en/seo.json";
import enVideo from "./locales/en/video.json";
import kkAbout from "./locales/kk/about.json";
import kkBenefits from "./locales/kk/benefits.json";
import kkCommon from "./locales/kk/common.json";
import kkFlow from "./locales/kk/flow.json";
import kkHistory from "./locales/kk/history.json";
import kkMcp from "./locales/kk/mcp.json";
import kkNav from "./locales/kk/nav.json";
import kkPlatforms from "./locales/kk/platforms.json";
import kkPricing from "./locales/kk/pricing.json";
import kkResults from "./locales/kk/results.json";
import kkSecurity from "./locales/kk/security.json";
import kkSeo from "./locales/kk/seo.json";
import kkVideo from "./locales/kk/video.json";
import ruAbout from "./locales/ru/about.json";
import ruBenefits from "./locales/ru/benefits.json";
import ruCommon from "./locales/ru/common.json";
import ruFlow from "./locales/ru/flow.json";
import ruHistory from "./locales/ru/history.json";
import ruMcp from "./locales/ru/mcp.json";
import ruNav from "./locales/ru/nav.json";
import ruPlatforms from "./locales/ru/platforms.json";
import ruPricing from "./locales/ru/pricing.json";
import ruResults from "./locales/ru/results.json";
import ruSecurity from "./locales/ru/security.json";
import ruSeo from "./locales/ru/seo.json";
import ruVideo from "./locales/ru/video.json";

// All landing (/, /ru/, /kk/) copy: `locales/<locale>/<section>.json` (i18next-style, one file per page section).
// Sources/links stay in the components' data; only text lives there. `ru` and `kk` are typed as `en`'s shape, so a
// missing or renamed key is a type error.
const en = {
	nav: enNav,
	common: enCommon,
	seo: enSeo,
	video: enVideo,
	history: enHistory,
	flow: enFlow,
	results: enResults,
	about: enAbout,
	mcp: enMcp,
	platforms: enPlatforms,
	benefits: enBenefits,
	security: enSecurity,
	pricing: enPricing,
};

export type LandingContent = typeof en;

const ru: LandingContent = {
	nav: ruNav,
	common: ruCommon,
	seo: ruSeo,
	video: ruVideo,
	history: ruHistory,
	flow: ruFlow,
	results: ruResults,
	about: ruAbout,
	mcp: ruMcp,
	platforms: ruPlatforms,
	benefits: ruBenefits,
	security: ruSecurity,
	pricing: ruPricing,
};

const kk: LandingContent = {
	nav: kkNav,
	common: kkCommon,
	seo: kkSeo,
	video: kkVideo,
	history: kkHistory,
	flow: kkFlow,
	results: kkResults,
	about: kkAbout,
	mcp: kkMcp,
	platforms: kkPlatforms,
	benefits: kkBenefits,
	security: kkSecurity,
	pricing: kkPricing,
};

const content: Record<Locale, LandingContent> = { en, ru, kk };

export function landingContent(locale?: string): LandingContent {
	return content[(locale || DEFAULT_LOCALE) as Locale] ?? en;
}
