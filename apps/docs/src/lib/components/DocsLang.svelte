<script lang="ts">
	import { ALL_LOCALES, type Locale, localizeHref } from "#lib/i18n.js";

	// Rendered at the top of every docs page by vite/content-routes.ts. `path` is the page's
	// docs path without a locale (`/api/server/`), so the switch keeps the current page.
	let {
		locale,
		path,
		pending = false,
	}: { locale: Locale; path: string; pending?: boolean } = $props();

	// Shown while a translation has `review: pending` in its frontmatter.
	const notices: Record<Locale, string> = {
		en: "This translation is under review.",
		ru: "Этот перевод проходит проверку.",
		kk: "Бұл бет машиналық аудармамен жасалған және тексерілуде. Қателер болуы мүмкін - ағылшын нұсқасын қараңыз.",
	};
</script>

<nav class="docs-lang" aria-label="Language">
	{#each ALL_LOCALES as l (l)}
		<a
			href={localizeHref(`/docs${path}`, l)}
			aria-current={l === locale ? "true" : undefined}
			hreflang={l}>{l.toUpperCase()}</a
		>
	{/each}
</nav>
{#if pending}
	<p class="docs-lang-notice" lang={locale}>{notices[locale]}</p>
{/if}

<style>
	.docs-lang {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		font-size: 0.8rem;
	}
	.docs-lang a[aria-current="true"] {
		font-weight: 700;
		text-decoration: none;
	}
	.docs-lang-notice {
		margin: 0.5rem 0;
		padding: 0.5rem 0.75rem;
		border-left: 3px solid currentColor;
		font-size: 0.85rem;
		opacity: 0.85;
	}
</style>
