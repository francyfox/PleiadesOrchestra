<script lang="ts">
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	let c = $derived(landingContent(localeFromPath(page.url.pathname)));
	let t = $derived(c.security);

	// Positions are the team's reading of the market; facts are linked. See docs/reserch/threats-security-monetization.md.
	// Same order as t.points; '' = no source.
	const sources = [
		"https://yandex.ru/company/news/27-02-2026-01",
		"https://support.google.com/merchants/answer/16837055?hl=en",
		"https://webmcp.com/ecosystem-tracker",
		"",
	];
</script>

<Pane title="guest@pleiades — security and money" header={false} id="security">
	<h2 class="text-xl font-bold">{t.heading}</h2>
	<p class="mt-2 max-w-3xl text-sm" style:color="var(--dim)">{t.lead}</p>

	<ul class="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
		{#each t.points as point, i (point.title)}
			<li class="flex flex-col border p-4">
				<h3 class="font-bold" style:color="var(--accent)">{point.title}</h3>
				<p class="mt-1 text-sm" style:color="var(--dim)">{point.text}</p>
				{#if sources[i]}
					<a
						href={sources[i]}
						class="link-underline mt-2 text-xs"
						style:color="var(--dim)"
						rel="external noopener">{c.common.source}</a
					>
				{/if}
			</li>
		{/each}
	</ul>

	<aside class="mt-6 border p-4" style:border-color="var(--accent-2)">
		<h3 class="font-bold" style:color="var(--accent-2)">{t.early.heading}</h3>
		<p class="mt-1 max-w-3xl text-sm">{t.early.text}</p>
	</aside>
</Pane>
