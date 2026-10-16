<script lang="ts">
	import Pane from "#lib/components/Pane.svelte";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	let t = $derived(landingContent(page.params.locale).about);
</script>

<Pane title="guest@pleiades — about" header={false} id="about" class="lg:col-span-2">
	<h2 class="text-xl font-bold">{t.heading}</h2>
	<p class="mt-2 max-w-3xl text-sm">{t.text}</p>

	<dl class="mt-6 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
		{#each t.stars as star (star.name)}
			<dt style:color="var(--accent)">{star.name}</dt>
			<dd style:color="var(--dim)">{star.role}</dd>
		{/each}
	</dl>

	<ul class="mt-6 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
		{#each t.stats as stat (stat.label)}
			<li class="border p-3">
				<span class="block text-xs" style:color="var(--dim)">{stat.label}</span>
				<strong style:color="var(--accent)">{stat.value}</strong>
			</li>
		{/each}
	</ul>
</Pane>
