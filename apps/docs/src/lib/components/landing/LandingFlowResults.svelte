<script lang="ts">
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { FLOW_RESULTS } from "#lib/landing/flow.data.js";
	import { bars, claims } from "#lib/landing/flow.service.js";
	import { page } from "$app/state";

	const t = $derived(landingContent(localeFromPath(page.url.pathname)).results);
	const headline = claims(FLOW_RESULTS);
	const groups = bars(FLOW_RESULTS.contenders);
</script>

<Pane title="guest@pleiades — results" header={false} id="results">
	<div class="text-6xl font-bold mb-5 md:mb-15">{t.heading}</div>

	<div class="mt-6 grid grid-cols-1 gap-8 md:grid-cols-[minmax(10rem,14rem)_1fr]">
		<ul class="flex flex-wrap gap-8 md:flex-col">
			{#each headline as claim (claim.key)}
				<li>
					<strong class="block text-6xl leading-none font-bold" style:color="var(--accent)">{claim.value}</strong>
					<span class="mt-2 block max-w-56 text-sm" style:color="var(--dim)">
						{t.claims[claim.key].replace("{model}", claim.versus)}
					</span>
				</li>
			{/each}
		</ul>

		<div class="flex flex-col gap-6">
			{#each groups as group (group.key)}
				<dl class="grid grid-cols-1 gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[16rem_1fr] sm:items-center">
					<dt class="text-xs font-bold sm:col-span-2" style:color="var(--accent-2)">{t.metrics[group.key]}</dt>
					{#each group.rows as row (row.name)}
						<dd
							class="m-0 truncate"
							title={row.name}
							style:color={row.orchestra ? "var(--accent)" : "var(--dim)"}
						>
							{row.name}
						</dd>
						<dd class="m-0 flex items-center gap-2">
							<span
								class="results-bar h-5 border"
								class:results-bar-win={row.orchestra}
								style:width="max({row.width}%, 0.75rem)"
							></span>
							<span class="shrink-0 text-xs tabular-nums">{row.label}</span>
						</dd>
					{/each}
				</dl>
			{/each}
		</div>
	</div>

	<p class="border-t pt-4 text-xs" style:margin-top="2rem" style:color="var(--dim)" style:border-color="var(--rule)">
		{t.note.replace("{date}", FLOW_RESULTS.date)}
	</p>
	<a href={FLOW_RESULTS.docs} class="chip inline-block border px-3 py-2 text-sm" style:margin-top="1rem">{t.link}</a>
</Pane>

<style>
	.results-bar {
		/* The value label sits after the bar, so the longest bar leaves it room. */
		max-width: calc(100% - 5rem);
		border-color: var(--rule);
		background: var(--muted);
	}
	.results-bar-win {
		border-color: var(--accent);
		background: var(--accent);
		box-shadow: var(--shadow-xs);
	}
</style>
