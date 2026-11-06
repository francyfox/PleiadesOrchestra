<script lang="ts">
	import { localeFromPath, localizeHref } from "#lib/i18n.js";
	import { LANDING_SECTIONS, landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	/**
	 * Landing section links. Default: the sticky row under the header (from `lg`, 1024px).
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
	<!-- Below `lg` (1024px) the burger holds the links, from `lg` the row does (the theme's burger lives until 1440px). -->
	<nav
		aria-label={nav.label}
		class={mobile
			? "mt-[0.5rem] border-t border-(--border) px-[0.5rem] pt-[0.5rem] lg:hidden"
			: "sticky top-(--po-nav) z-50 h-(--po-landing-nav) overflow-x-auto bg-muted shadow-(--shadow-xs) max-lg:hidden"}
	>
		<ul
			class={mobile
				? "m-0! list-none! p-0!"
				: "flex h-full items-center gap-[0.25rem] px-[1rem]! py-[0.05rem]! whitespace-nowrap [justify-content:safe_center]"}
		>
			{#each LANDING_SECTIONS as id (id)}
				<li>
					<a
						href="#{id}"
						onclick={onnavigate}
						class="block rounded-(--radius) font-medium text-(--muted-foreground)! no-underline! hover:bg-(--primary) hover:text-(--muted)! {mobile
							? 'px-[0.5rem]! py-[0.625rem]!'
							: 'px-[0.75rem]! py-[0.05rem]! text-[0.875rem] uppercase'}">{nav[id]}</a
					>
				</li>
			{/each}
		</ul>
	</nav>
{/if}
