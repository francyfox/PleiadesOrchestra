<script lang="ts">
	import type { Component } from "svelte";
	import BitrixIcon from "#lib/components/brand-icons/BitrixIcon.svelte";
	import OpenCartIcon from "#lib/components/brand-icons/OpenCartIcon.svelte";
	import WooCommerceIcon from "#lib/components/brand-icons/WooCommerceIcon.svelte";
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	let t = $derived(landingContent(localeFromPath(page.url.pathname)).platforms);

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
</script>

<Pane title="guest@pleiades — platforms" header={false} id="platforms" class="py-10 !border-0">
	<div class="text-3xl md:text-4xl font-bold mb-5">{t.heading}</div>
	<p class="mt-2 max-w-3xl text-sm text-dim">{t.lead}</p>

	<ul class="list grid grid-cols-1 gap-3 md:grid-cols-3">
		{#each platforms as platform (platform.name)}
			<li class="flex">
				<svelte:element
					this={platform.href ? "a" : "div"}
					href={platform.href}
					target={platform.href ? "_blank" : undefined}
					rel={platform.href ? "noopener noreferrer" : undefined}
					class="platform flex w-full flex-col items-center gap-3 border p-5"
					class:off={!platform.available}
				>
					<span class="logo"><platform.icon /></span>
					<span class="name font-bold">{platform.name}</span>
					<span class="chip border px-2 py-0.5 text-xs">
						{platform.available ? t.available : t.soon}
					</span>
				</svelte:element>
			</li>
		{/each}
	</ul>
</Pane>

<style>
	.list {
		margin-top: 1.5rem;
	}
	.logo {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 4rem;
	}
	/* One width for wide wordmarks, one height for the square mark: they read about the same size. */
	.logo :global(svg) {
		width: 100%;
		max-width: 10rem;
		height: 100%;
		max-height: 3rem;
	}
	/* Only the logo and name fade: the status must stay readable. */
	.off .logo,
	.off .name {
		opacity: 0.5;
	}
	a.platform:hover {
		border-color: var(--accent);
	}
</style>
