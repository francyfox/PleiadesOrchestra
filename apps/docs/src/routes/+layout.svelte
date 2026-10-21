<script lang="ts">
	// The design system (packages/ui), then the SveltePress theme mapped onto it.
	import "@repo/ui/fonts.css";
	import "@repo/ui/tokens.css";
	import "#lib/docs-theme.css";
	import "#lib/site-header.css";
	import type { Snippet } from "svelte";
	import Seo from "#lib/components/Seo.svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { SITE } from "#lib/site.js";
	import { page } from "$app/state";

	let { children }: { children: Snippet } = $props();
	// Docs pages carry their own card (title, description) from vite/content-routes.ts.
	const isDocs = $derived(/^\/(\w+\/)?docs\//.test(page.url.pathname));
</script>

{#if !isDocs}
	<Seo
		title={SITE.title}
		description={SITE.description}
		locale={localeFromPath(page.url.pathname)}
	/>
{/if}

{@render children()}

<footer class="site-footer">
	<!-- Sveltia CMS (static/admin): a static page, not a SvelteKit route. -->
	<a href="/admin/" data-sveltekit-reload>Admin</a>
</footer>

<style>
	.site-footer {
		display: flex;
		justify-content: center;
		padding: 1.5rem 1rem;
		font-size: 0.8rem;
		opacity: 0.7;
	}
</style>
