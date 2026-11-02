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

<Pane title="guest@pleiades — security and money" header={false} id="security" class="!border-0">
	<div class="flex flex-col gap-5">
		<div class="text-3xl md:text-4xl font-bold">{t.heading}</div>
		<p class="max-w-3xl text-sm text-dim">{t.lead}</p>

		<ul class="grid grid-cols-1 gap-3 md:grid-cols-2">
			{#each Object.values(t.points) as point, i (point.title)}
				<li class="flex flex-col gap-3 border p-4">
					<span class="font-bold text-accent">{point.title}</span>
					<p class="mt-1 text-sm text-dim">{point.text}</p>
					{#if sources[i]}
						<span class="flex">
							<a
									href={sources[i]}
									class="link-underline mt-2 text-xs text-dim!"
									rel="external noopener">{c.common.source}</a
							>
						</span>
					{/if}
				</li>
			{/each}
		</ul>

		<aside class="border border-accent-2! p-4">
			<h3 class="font-bold! text-accent-2!">{t.early.heading}</h3>
			<p class="mt-1 max-w-3xl text-sm">{t.early.text}</p>
		</aside>
	</div>
</Pane>
