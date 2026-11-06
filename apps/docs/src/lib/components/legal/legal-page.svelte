<script lang="ts">
	import { localeFromPath } from "#lib/i18n.js";
	import { type LEGAL_PAGES, landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	let { slug }: { slug: (typeof LEGAL_PAGES)[number] } = $props();
	let legal = $derived(landingContent(localeFromPath(page.url.pathname)).legal);
	let doc = $derived(legal[slug]);

	/** `split` with a capture group: the odd parts are e-mail addresses, shown as mailto links (no trailing dot). */
	const EMAIL = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/;
	const parts = (text: string) => text.split(EMAIL);
</script>

<article class="legal">
	<h1>{doc.title}</h1>
	<p class="updated">{legal.updated}</p>
	{#each doc.sections as section, i (section.heading)}
		<section>
			<h2>{i + 1}. {section.heading}</h2>
			{#each section.paragraphs as text (text)}
				<p>{#each parts(text) as part, i (i)}{#if i % 2}<a href="mailto:{part}">{part}</a>{:else}{part}{/if}{/each}</p>
			{/each}
		</section>
	{/each}
</article>

<style>
	.legal {
		max-width: 48rem;
		margin: 0 auto;
		padding: 2rem 1rem;
		color: var(--foreground);
	}
	.updated {
		color: var(--muted-foreground);
	}
	h2 {
		margin-top: 2rem;
	}
	p {
		line-height: 1.6;
	}
</style>
