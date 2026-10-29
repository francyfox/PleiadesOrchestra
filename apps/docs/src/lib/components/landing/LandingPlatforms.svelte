<script lang="ts">
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	let c = $derived(landingContent(localeFromPath(page.url.pathname)));
	let t = $derived(c.platforms);

	// Status of each platform's own MCP support, checked 2026-10; see docs/reserch/cms-platforms-cis.md.
	// Same order as t.items.
	const sources = [
		"https://developer.woocommerce.com/docs/features/mcp/",
		"https://helpdesk.bitrix24.ru/open/27050746/",
		"https://github.com/chrisbray85/opencart-mcp",
	];
</script>

<Pane title="guest@pleiades — platforms" header={false} id="platforms">
	<h2 class="text-xl font-bold">{t.heading}</h2>
	<p class="mt-2 max-w-3xl text-sm" style:color="var(--dim)">{t.lead}</p>

	<ul class="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
		{#each Object.values(t.items) as platform, i (platform.name)}
			<li class="flex flex-col border p-4">
				<h3 class="font-bold" style:color="var(--accent)">{platform.name}</h3>
				<span class="chip mt-1 self-start border px-2 py-0.5 text-xs">{platform.status}</span>
				<p class="mt-2 text-sm" style:color="var(--dim)">{platform.text}</p>
				<a
					href={sources[i]}
					class="link-underline mt-2 text-xs"
					style:color="var(--dim)"
					rel="external noopener">{c.common.source}</a
				>
			</li>
		{/each}
	</ul>
</Pane>
