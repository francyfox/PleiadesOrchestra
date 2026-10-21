<script lang="ts">
	import { MetaTags } from "svelte-meta-tags";
	import type { Locale } from "#lib/i18n.js";
	import { OG_IMAGE, SITE, SITE_URL } from "#lib/site.js";
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
</script>

<MetaTags
	openGraph={{
		type: "website",
		siteName: SITE.title,
		title,
		description,
		url: `${SITE_URL}${page.url.pathname}`,
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
