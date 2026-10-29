<script lang="ts">
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import {
		PLEIADES_BUY_URL,
		PLEIADES_CLOUD_CHECKOUT_URL,
		PLEIADES_CONTACT,
		PLEIADES_REPO_URL,
		PLEIADES_TERMS_URL,
	} from "#lib/site.js";
	import { page } from "$app/state";

	let t = $derived(landingContent(localeFromPath(page.url.pathname)).pricing);

	const buyHref =
		PLEIADES_BUY_URL ||
		`mailto:${PLEIADES_CONTACT}?subject=PleiadesOrchestra%20commercial%20license`;
	// Keep in sync with the Polar product behind PLEIADES_BUY_URL.
	const price = "500$";
	// Keep in sync with the Polar product behind PLEIADES_CLOUD_CHECKOUT_URL.
	const cloudPrice = "$20";
</script>

<Pane title="guest@pleiades — pricing" header={false} id="pricing">
	<h2 class="text-xl font-bold">{t.heading}</h2>

	<div class="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
		<article class="flex flex-col border p-4">
			<h3 class="font-bold" style:color="var(--accent-2)">{t.community.title}</h3>
			<p class="mt-1 text-3xl font-bold">{t.community.price}</p>
			<p class="mt-2 text-sm" style:color="var(--dim)">{t.community.text}</p>
			<a
				href={PLEIADES_REPO_URL}
				rel="external"
				class="chip mt-auto self-start border px-3 py-2 text-sm"
				style:margin-top="1.5rem">{t.community.cta}</a
			>
		</article>

		<article class="flex flex-col border p-4" style:border-color="var(--accent-2)">
			<h3 class="font-bold" style:color="var(--accent-2)">{t.cloud.title}</h3>
			<p class="mt-1 text-3xl font-bold">{cloudPrice} <span class="text-sm font-normal">{t.cloud.perMonth}</span></p>
			<p class="mt-2 text-sm" style:color="var(--dim)">{t.cloud.text}</p>
			<ul class="mt-2 list-disc pl-5 text-sm">
				{#each Object.values(t.cloud.includes) as item (item)}<li>{item}</li>{/each}
			</ul>
			<p class="mt-2 text-sm" style:color="var(--dim)">{t.cloud.privacy}</p>
			<div class="mt-6 flex flex-wrap items-center gap-2 text-sm">
				<a
					href={PLEIADES_CLOUD_CHECKOUT_URL}
					class="chip border px-3 py-2 font-bold"
					target="_blank"
					rel="noreferrer noopener"
					style:background="var(--accent-2)"
					style:color="var(--bg)"
					style:border-color="var(--accent-2)">{t.cloud.buy}</a
				>
			</div>
		</article>

		<article class="flex flex-col border p-4" style:border-color="var(--accent)">
			<h3 class="font-bold" style:color="var(--accent)">{t.business.title}</h3>
			<p class="mt-1 text-3xl font-bold">{price} <span class="text-sm font-normal">{t.business.oneTime}</span></p>
			<p class="mt-2 text-sm" style:color="var(--dim)">{t.business.text}</p>
			<div class="mt-6 flex flex-wrap items-center gap-2 text-sm">
				<a
					href={buyHref}
					class="chip border px-3 py-2 font-bold"
					target="_blank"
					rel="noreferrer noopener"
					style:background="var(--accent)"
					style:color="var(--bg)"
					style:border-color="var(--accent)"
					>{PLEIADES_BUY_URL ? t.business.buy : t.business.ask}</a
				>
				<a href={PLEIADES_TERMS_URL} rel="external" class="link-underline">{t.business.terms}</a>
			</div>
		</article>
	</div>
</Pane>
