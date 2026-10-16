<script lang="ts">
	import type { Locale } from "#lib/i18n.js";

	// Put at the top of a docs page by vite/content-routes.ts while its
	// translation has `review: pending` in the frontmatter.
	let { locale }: { locale: Locale } = $props();

	const notices: Record<Locale, string> = {
		en: "This translation is under review.",
		ru: "Этот перевод проходит проверку.",
		kk: "Бұл бет машиналық аудармамен жасалған және тексерілуде. Қателер болуы мүмкін - ағылшын нұсқасын қараңыз.",
	};
</script>

<p class="review-notice" lang={locale}>{notices[locale]}</p>

<style>
	.review-notice {
		margin: 0.5rem 0;
		padding: 0.5rem 0.75rem;
		border-left: 3px solid currentColor;
		font-size: 0.85rem;
		opacity: 0.85;
	}
</style>
