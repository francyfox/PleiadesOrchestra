<script lang="ts">
	import type { Component } from "svelte";
	import BitrixIcon from "#lib/components/brand-icons/BitrixIcon.svelte";
	import OpenCartIcon from "#lib/components/brand-icons/OpenCartIcon.svelte";
	import WooCommerceIcon from "#lib/components/brand-icons/WooCommerceIcon.svelte";
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	let c = $derived(landingContent(localeFromPath(page.url.pathname)));
	let t = $derived(c.platforms);

	// Add `href` when a platform has a page to open; `available` when the widget can be installed there.
	const platforms: {
		name: string;
		icon: Component;
		available: boolean;
		href?: string;
	}[] = [
		{ name: "WooCommerce", icon: WooCommerceIcon, available: false },
		{ name: "OpenCart", icon: OpenCartIcon, available: false },
		{ name: "1C-Bitrix", icon: BitrixIcon, available: false },
	];

	// Only the logo and name fade: the status must stay readable.
	const fade = (available: boolean) => (available ? "" : "opacity-50");
</script>

<Pane title="guest@pleiades — platforms" header={false} id="platforms" class="py-10 !border-0">
	<h2 class="text-3xl! md:text-4xl! font-bold! mb-5!">{t.heading}</h2>
	<p class="mt-2 max-w-3xl text-sm text-dim">{t.lead}</p>

	<ul class="mt-[1.5rem]! grid grid-cols-1 gap-3 md:grid-cols-3">
		{#each platforms as platform (platform.name)}
			<li class="flex">
				<svelte:element
					this={platform.href ? "a" : "div"}
					href={platform.href}
					target={platform.href ? "_blank" : undefined}
					rel={platform.href ? "noopener noreferrer" : undefined}
					class="flex w-full flex-col items-center gap-3 border p-5 {platform.href ? 'hover:border-accent!' : ''}"
				>
					<!-- One width for wide wordmarks, one height for the square mark: they read about the same size. -->
					<span class="flex h-[4rem] w-full items-center justify-center [&>svg]:h-full [&>svg]:max-h-[3rem] [&>svg]:w-full [&>svg]:max-w-[10rem] {fade(platform.available)}"><platform.icon /></span>
					<span class="font-bold {fade(platform.available)}">{platform.name}</span>
					<span class="chip border px-2 py-0.5 text-xs">
						{platform.available ? t.available : t.soon}
					</span>
					{#if platform.href}<span class="sr-only">{c.common.newTab}</span>{/if}
				</svelte:element>
			</li>
		{/each}
	</ul>
</Pane>
