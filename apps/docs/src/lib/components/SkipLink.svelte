<script lang="ts">
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	// Patched in before the theme's header by vite/theme-markup.ts; `#main` is the theme's <main>, given an id there.
	let t = $derived(landingContent(localeFromPath(page.url.pathname)).common);
</script>

<a class="skip-link" href="#main">{t.skipToContent}</a>

<style>
	.skip-link {
		position: fixed;
		top: 0.5rem;
		left: 0.5rem;
		z-index: 1000;
		padding: 0.5rem 1rem;
		border: 2px solid var(--ring);
		background: var(--background);
		color: var(--foreground);
		text-decoration: none;
		transform: translateY(-200%);
	}
	.skip-link:focus {
		transform: none;
	}
	/* Focus only marks where Tab continues; a ring around the whole page says nothing. */
	:global(#main:focus) {
		outline: none;
	}
</style>
