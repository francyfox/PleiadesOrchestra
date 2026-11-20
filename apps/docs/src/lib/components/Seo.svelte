<script lang="ts">
	import { MetaTags } from "svelte-meta-tags";
	import {
		ALL_LOCALES,
		LOCALES,
		type Locale,
		localizeHref,
	} from "#lib/i18n.js";
	import { OG_IMAGE, PLEIADES_REPO_URL, SITE, SITE_URL } from "#lib/site.js";
	import { page } from "$app/state";

	// OpenGraph + Twitter card of a page. Only those: the SveltePress theme already
	// writes <title> and <meta name="description">, passing them here would double them.
	let {
		title,
		description,
		locale,
	}: { title: string; description: string; locale: Locale } = $props();

	const OG_LOCALES: Record<Locale, string> = {
		en: "en_US",
		ru: "ru_RU",
		kk: "kk_KZ",
	};
	const image = { ...OG_IMAGE, alt: SITE.title };

	// Static build serves every page under a trailing slash: that is the canonical URL.
	const path = $derived(
		page.url.pathname.endsWith("/")
			? page.url.pathname
			: `${page.url.pathname}/`,
	);
	const canonical = $derived(`${SITE_URL}${path}`);
	// hreflang only for the landing, which exists in every locale; deeper pages are not
	// translated one-to-one, so pointing alternates at them could 404.
	const isLanding = $derived(
		path === "/" || LOCALES.some((l) => path === `/${l}/`),
	);
	const languageAlternates = $derived(
		isLanding
			? [
					...ALL_LOCALES.map((l) => ({
						hrefLang: l,
						href: `${SITE_URL}${localizeHref("/", l)}`,
					})),
					{ hrefLang: "x-default", href: `${SITE_URL}/` },
				]
			: undefined,
	);

	// schema.org: the landing describes the product, every other page is a documentation article.
	const jsonLd = $derived(
		isLanding
			? [
					{
						"@context": "https://schema.org",
						"@type": "SoftwareApplication",
						"@id": `${SITE_URL}/#software`,
						name: SITE.title,
						description: SITE.description,
						url: `${SITE_URL}/`,
						image: image.url,
						applicationCategory: "DeveloperApplication",
						operatingSystem: "Linux, macOS, Windows",
						license: "https://www.gnu.org/licenses/agpl-3.0.html",
						sameAs: [PLEIADES_REPO_URL],
						inLanguage: [...ALL_LOCALES],
					},
					{
						"@context": "https://schema.org",
						"@type": "WebSite",
						"@id": `${SITE_URL}/#website`,
						name: SITE.title,
						url: `${SITE_URL}/`,
					},
				]
			: {
					"@context": "https://schema.org",
					"@type": "TechArticle",
					headline: title,
					description,
					url: canonical,
					inLanguage: locale,
					image: image.url,
					isPartOf: { "@id": `${SITE_URL}/#website` },
				},
	);
	// `<` is escaped so a value can never close the script element early.
	const jsonLdHtml = $derived(
		`<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</${"script"}>`,
	);
</script>

<svelte:head>{@html jsonLdHtml}</svelte:head>

<MetaTags
	{canonical}
	{languageAlternates}
	openGraph={{
		type: "website",
		siteName: SITE.title,
		title,
		description,
		url: canonical,
		locale: OG_LOCALES[locale],
		images: [image],
	}}
	twitter={{
		cardType: "summary_large_image",
		title,
		description,
		image: image.url,
		imageAlt: image.alt,
	}}
/>
