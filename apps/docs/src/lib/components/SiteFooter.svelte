<script lang="ts">
	import { localeFromPath, localizeHref } from "#lib/i18n.js";
	import { LANDING_SECTIONS, landingContent } from "#lib/landing/content.js";
	import {
		PLEIADES_CONTACT,
		PLEIADES_PANEL_LOGIN_URL,
		PLEIADES_REPO_URL,
		PLEIADES_TERMS_URL,
		SITE,
	} from "#lib/site.js";
	import { page } from "$app/state";

	/** Docs pages: the theme's fixed sidebar covers the left edge. */
	let { docs = false }: { docs?: boolean } = $props();
	let locale = $derived(localeFromPath(page.url.pathname));
	let content = $derived(landingContent(locale));
	let t = $derived(content.footer);
	let home = $derived(localizeHref("/", locale));
</script>

<footer class="site-footer" class:docs aria-label={t.label}>
	<div class="columns">
		<div>
			<h2>{t.product}</h2>
			<ul>
				<li><a href={localizeHref("/docs/", locale)}>{t.docs}</a></li>
				<li><a href={localizeHref("/playground/", locale)}>{t.playground}</a></li>
				<li><a href={PLEIADES_PANEL_LOGIN_URL}>{t.panel}</a></li>
				<!-- Sveltia CMS (static/admin): a static page, not a SvelteKit route. -->
				<li><a href="/admin/" data-sveltekit-reload>{t.admin}</a></li>
			</ul>
		</div>
		<div>
			<h2>{t.sections}</h2>
			<ul>
				{#each LANDING_SECTIONS as id (id)}
					<li><a href="{home}#{id}">{content.nav[id]}</a></li>
				{/each}
			</ul>
		</div>
		<div>
			<h2>{t.resources}</h2>
			<ul>
				<li><a href={PLEIADES_REPO_URL}>{t.github}</a></li>
				<!-- English-only pages: no locale prefix. -->
				<li><a href="/docs/changelog/overview/">{t.changelog}</a></li>
				<li><a href="/docs/benchmarks/overview/">{t.benchmarks}</a></li>
				<li><a href="{home}llms.txt" rel="external">{t.llms}</a></li>
				<li><a href={PLEIADES_TERMS_URL}>{t.license}</a></li>
				<li><a href="mailto:{PLEIADES_CONTACT}">{t.contact}</a></li>
			</ul>
		</div>
	</div>
	<p class="brand">
		<img src="/logo.svg" alt="" width="20" height="20" />
		{SITE.title}
	</p>
</footer>

<style>
	.site-footer {
		position: relative;
		border-top: 1px solid var(--border);
		background-color: var(--muted);
		padding: 2rem 1rem 1.5rem;
		font-size: 0.875rem;
		color: var(--muted-foreground);
	}
	/* The theme's sidebar width from `sm` (Uno 640px), copied from its Sidebar.svelte. */
	@media (min-width: 640px) {
		.site-footer.docs {
			padding-left: calc(max(0px, (100vw - 1440px) / 2) + min(25vw, 288px) + 1rem);
		}
	}
	.columns {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 1.5rem;
		max-width: 64rem;
		margin: 0 auto;
	}
	h2 {
		margin: 0 0 0.75rem;
		border: 0;
		padding: 0;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--foreground);
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.5rem;
	}
	li {
		margin: 0;
	}
	/* `.site-footer` outweighs the theme's link colours. */
	.site-footer a {
		color: inherit;
		text-decoration: none;
	}
	.site-footer a:hover {
		color: var(--primary);
	}
	.brand {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		max-width: 64rem;
		margin: 2rem auto 0;
	}
</style>
