<script lang="ts">
	import Pane from "#lib/components/Pane.svelte";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	let c = $derived(landingContent(page.params.locale));
	let t = $derived(c.mcp);
</script>

<Pane title="guest@pleiades — mcp vs webmcp" header={false} id="mcp" class="lg:col-span-2">
	<h2 class="text-xl font-bold">{t.heading}</h2>
	<p class="mt-2 max-w-3xl text-sm" style:color="var(--dim)">{t.lead}</p>

	<p class="mt-3 max-w-3xl border p-3 text-sm" style:border-color="var(--accent-2)">
		<strong style:color="var(--accent-2)">{t.noteStrong}</strong>{t.noteBefore}
		<code>navigator.modelContext</code>
		{t.noteTo} <code>document.modelContext</code>. {t.noteAfter}
		<a
			href="https://www.eweek.com/news/google-webmcp-chrome-ai-web-standard-preview/"
			class="link-underline"
			rel="external noopener">{c.common.source}</a
		>,
		<a href="https://webmcp.com/ecosystem-tracker" class="link-underline" rel="external noopener"
			>{t.releaseTarget}</a
		>
	</p>

	<div class="mt-6 overflow-x-auto">
		<table class="w-full min-w-[40rem] border-collapse text-left text-sm">
			<thead>
				<tr class="border-b">
					<th scope="col" class="py-2 pr-4 font-normal" style:color="var(--dim)"></th>
					<th scope="col" class="py-2 pr-4" style:color="var(--accent)">{t.colMcp}</th>
					<th scope="col" class="py-2" style:color="var(--accent-2)"
						>{t.colWeb} <span class="text-xs font-normal">{t.experimental}</span></th
					>
				</tr>
			</thead>
			<tbody>
				{#each t.rows as row (row.label)}
					<tr class="border-b align-top">
						<th scope="row" class="py-3 pr-4 font-normal" style:color="var(--dim)"
							>{row.label}</th
						>
						<td class="py-3 pr-4">{row.mcp}</td>
						<td class="py-3">{row.web}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</Pane>
