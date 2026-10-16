<script lang="ts">
	import Pane from "#lib/components/Pane.svelte";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	let c = $derived(landingContent(page.params.locale));
	let t = $derived(c.history);

	// Facts checked against vendors' own docs/announcements; texts live in #lib/landing/content.ts,
	// in the same order as these sources.
	const sources = [
		"https://developer.salesforce.com/blogs/2025/06/introducing-mcp-support-across-salesforce",
		"https://digitalcommerce360.com/2026/03/06/openai-shifts-checkout-plans-agentic-commerce-strategy/",
		"https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation",
		"https://shopify.dev/docs/apps/build/storefront-mcp/servers/storefront",
		"https://developers.hubspot.com/changelog/remote-hubspot-mcp-server-is-now-generally-available",
		"https://developer.salesforce.com/blogs/2026/04/salesforce-hosted-mcp-servers-are-now-generally-available",
	];
</script>

<Pane title="guest@pleiades — world market" header={false} id="history" class="lg:col-span-2">
	<h2 class="text-xl font-bold">{t.heading}</h2>
	<p class="mt-2 max-w-3xl text-sm" style:color="var(--dim)">{t.lead}</p>

	<ol class="relative mt-6 ml-2 border-l" style:border-color="var(--rule)">
		{#each t.events as event, i (event.title)}
			<li class="relative pb-6 pl-6 last:pb-0">
				<span
					class="absolute top-1.5 -left-[5px] h-2.5 w-2.5 rounded-full"
					style:background="var(--accent)"
					aria-hidden="true"
				></span>
				{#if /^\d/.test(event.date)}
					<time class="text-xs" style:color="var(--accent-2)" datetime={event.date}
						>{event.date}</time
					>
				{:else}
					<span class="text-xs" style:color="var(--accent-2)">{event.date}</span>
				{/if}
				<h3 class="font-bold">{event.title}</h3>
				<p class="max-w-2xl text-sm" style:color="var(--dim)">{event.text}</p>
				<ul class="mt-2 flex flex-wrap gap-1.5 text-xs" aria-label={t.canLabel}>
					{#each event.can as action (action)}
						<li class="chip border px-2 py-0.5">{action}</li>
					{/each}
				</ul>
				<a
					href={sources[i]}
					class="link-underline mt-1 inline-block text-xs"
					style:color="var(--dim)"
					rel="external noopener">{c.common.source}</a
				>
			</li>
		{/each}
	</ol>

	<aside class="mt-8 border p-4" style:border-color="var(--accent)">
		<h3 class="font-bold" style:color="var(--accent)">{t.cis.heading}</h3>
		<div class="mt-4 overflow-x-auto">
			<table class="w-full min-w-[40rem] border-collapse text-left text-sm">
				<thead>
					<tr class="border-b" style:color="var(--dim)">
						<th scope="col" class="py-2 pr-4 font-normal">{t.cis.cols.country}</th>
						<th scope="col" class="px-2 py-2 text-center font-normal">{t.cis.cols.assistant}</th>
						<th scope="col" class="px-2 py-2 text-center font-normal">{t.cis.cols.acts}</th>
						<th scope="col" class="px-2 py-2 text-center font-normal">{t.cis.cols.mcp}</th>
						<th scope="col" class="py-2 pl-4 font-normal">{t.cis.cols.note}</th>
					</tr>
				</thead>
				<tbody>
					{#each t.cis.rows as row (row.country)}
						<tr class="border-b align-top">
							<th scope="row" class="py-2 pr-4 font-bold">{row.country}</th>
							{#each [row.assistant, row.acts, row.mcp] as found, i (i)}
								<td class="px-2 py-2 text-center">
									<span
										style:color={found ? 'var(--accent)' : 'var(--dim)'}
										aria-label={found ? t.cis.yes : t.cis.no}>{found ? '✓' : '–'}</span
									>
								</td>
							{/each}
							<td class="py-2 pl-4" style:color="var(--dim)">{row.note}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="mt-2 text-xs" style:color="var(--dim)">{t.cis.legend}</p>
	</aside>
</Pane>
