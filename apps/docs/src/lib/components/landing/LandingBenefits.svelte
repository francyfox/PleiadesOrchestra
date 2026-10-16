<script lang="ts">
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	let t = $derived(landingContent(localeFromPath(page.url.pathname)).benefits);
</script>

<Pane title="guest@pleiades — benefits" header={false} id="benefits" class="lg:col-span-2">
	<h2 class="text-xl font-bold">{t.heading}</h2>
	<ul class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each t.items as benefit (benefit.title)}
			<li class="border p-4">
				<h3 class="font-bold" style:color="var(--accent)">{benefit.title}</h3>
				<p class="mt-1 text-sm" style:color="var(--dim)">{benefit.text}</p>
			</li>
		{/each}
	</ul>
</Pane>
