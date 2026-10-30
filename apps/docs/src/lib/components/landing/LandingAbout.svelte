<script lang="ts">
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	let t = $derived(landingContent(localeFromPath(page.url.pathname)).about);
</script>

<section title="guest@pleiades — about" id="about" class="!border-0 px-4 py-10 flex items-center	 min-h-[70vh]">
	<div class="container">
		<div class="flex flex-col gap-5">
			<div class="text-3xl md:text-6xl font-bold">{t.heading}</div>
			<p class="mt-2 max-w-3xl text-md md:text-xl">{t.text}</p>

			<dl class="mt-6 grid grid-cols-1 gap-x-6 gap-y-2 text-md sm:grid-cols-[auto_1fr]">
				{#each Object.values(t.stars) as star (star.name)}
					<dt style:color="var(--accent)">¶ {star.name}</dt>
					<dd style:color="var(--dim)">{star.role}</dd>
				{/each}
			</dl>
		</div>
	</div>
</section>
