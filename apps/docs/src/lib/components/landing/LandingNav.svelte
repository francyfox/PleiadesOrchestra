<script lang="ts">
	import { localeFromPath, localizeHref } from "#lib/i18n.js";
	import { LANDING_SECTIONS, landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	/**
	 * Landing section links. Default: the sticky row under the header (from 950px).
	 * `mobile`: the list inside the theme's burger menu (vite/mobile-menu.ts), only on the landing.
	 */
	let {
		mobile = false,
		onnavigate,
	}: { mobile?: boolean; onnavigate?: () => void } = $props();

	let locale = $derived(localeFromPath(page.url.pathname));
	let nav = $derived(landingContent(locale).nav);
	let onLanding = $derived(page.url.pathname === localizeHref("/", locale));
</script>

{#if !mobile || onLanding}
	<nav class="landing-nav" class:mobile aria-label={nav.label}>
		<ul>
			{#each LANDING_SECTIONS as id (id)}
				<li><a href="#{id}" onclick={onnavigate}>{nav[id]}</a></li>
			{/each}
		</ul>
	</nav>
{/if}

<style>
	/* Sticky under the theme's fixed header (--po-nav); fixed height, so sections can subtract it. */
	.landing-nav:not(.mobile) {
		height: var(--po-landing-nav);
		position: sticky;
		top: var(--po-nav);
		z-index: 50;
		overflow-x: auto;
		background-color: var(--muted);
		box-shadow: var(--shadow-xs);
	}
	.landing-nav:not(.mobile) ul {
		display: flex;
		align-items: center;
		height: 100%;
		justify-content: safe center;
		gap: 0.25rem;
		padding: 0.05rem 1rem;
		white-space: nowrap;
	}
	.landing-nav:not(.mobile) a {
		padding: 0.05rem 0.75rem;
		font-size: 0.875rem;
		text-transform: uppercase;
	}
	.landing-nav a {
		display: block;
		border-radius: var(--radius);
		color: var(--muted-foreground);
		font-weight: 500;
		text-decoration: none;
	}
	.landing-nav a:hover {
		background: var(--primary);
		color: var(--muted);
	}
	/* Below 950px the burger holds the links; from 950px the row does (the burger lives until 1440px). */
	@media (max-width: 949px) {
		.landing-nav:not(.mobile) {
			display: none;
		}
	}
	@media (min-width: 950px) {
		.landing-nav.mobile {
			display: none;
		}
	}
	.landing-nav.mobile {
		margin-top: 0.5rem;
		padding: 0.5rem 0.5rem 0;
		border-top: 1px solid var(--border);
	}
	.landing-nav.mobile ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.landing-nav.mobile a {
		padding: 0.625rem 0.5rem;
	}
</style>
