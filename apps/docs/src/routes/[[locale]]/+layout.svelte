<script lang="ts">
	import "#lib/pleiades-site.css";
	import type { Snippet } from "svelte";
	import { DEFAULT_LOCALE, LOCALES } from "#lib/i18n.js";
	import { page } from "$app/state";

	let { children }: { children: Snippet } = $props();

	// The same path under another locale: strip the current prefix, add the target one.
	let rest = $derived(
		page.url.pathname.replace(
			new RegExp(`^/(${LOCALES.join("|")})(?=/|$)`),
			"",
		) || "/",
	);
	const switchTo = (locale: string) =>
		locale === DEFAULT_LOCALE ? rest : `/${locale}${rest}`;
</script>

<div class="po-site">
	<nav class="flex justify-end gap-2 px-3 py-1 text-xs" aria-label="Language">
		{#each [DEFAULT_LOCALE, ...LOCALES] as locale (locale)}
			<a
				href={switchTo(locale)}
				class="chip border px-2 py-0.5 uppercase"
				aria-current={(page.params.locale ?? DEFAULT_LOCALE) === locale ? "true" : undefined}
				>{locale}</a
			>
		{/each}
	</nav>
	{@render children()}
</div>
