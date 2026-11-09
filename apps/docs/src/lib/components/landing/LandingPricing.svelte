<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import {
		PLEIADES_BUY_URL,
		PLEIADES_CONTACT,
		PLEIADES_PANEL_BILLING_URL,
		PLEIADES_REPO_URL,
		PLEIADES_TERMS_URL,
	} from "#lib/site.js";
	import { page } from "$app/state";
	import PricesDialog from "./PricesDialog.svelte";

	let c = $derived(landingContent(localeFromPath(page.url.pathname)));
	let t = $derived(c.pricing);

	const buyHref =
		PLEIADES_BUY_URL ||
		`mailto:${PLEIADES_CONTACT}?subject=PleiadesOrchestra%20commercial%20license`;
	// Keep in sync with the Polar product behind PLEIADES_BUY_URL.
	const price = "$800";
	// Keep in sync with the Polar plan product (POLAR_PLAN_PRODUCT_ID) sold on PLEIADES_PANEL_BILLING_URL.
	const cloudPrice = "$20";

	let plans = $derived([
		{
			title: t.cloud.title,
			text: t.cloud.text,
			price: cloudPrice,
			unit: `/ ${t.cloud.perMonth}`,
			cta: t.cloud.buy,
			href: PLEIADES_PANEL_BILLING_URL,
			external: true,
			includes: Object.values(t.cloud.includes),
			listTitle: t.cloud.listTitle,
			tone: "var(--accent-2)",
			filled: true,
			terms: false,
			prices: true,
		},
		{
			title: t.community.title,
			text: t.community.text,
			price: t.community.price,
			unit: "",
			cta: t.community.cta,
			href: PLEIADES_REPO_URL,
			external: false,
			includes: Object.values(t.community.includes),
			listTitle: t.community.listTitle,
			tone: "var(--accent-2)",
			filled: false,
			terms: false,
			prices: false,
		},
		{
			title: t.business.title,
			text: t.business.text,
			price,
			unit: t.business.oneTime,
			cta: PLEIADES_BUY_URL ? t.business.buy : t.business.ask,
			href: buyHref,
			external: true,
			includes: Object.values(t.business.includes),
			listTitle: "",
			tone: "var(--accent)",
			filled: true,
			terms: true,
			prices: false,
		},
	]);
</script>

<Pane title="guest@pleiades — pricing" header={false} id="pricing" class="!border-0 py-10">
	<h2 class="text-3xl! md:text-4xl! font-bold!">{t.heading}</h2>

	<div class="mt-[1.5rem] grid gap-[1rem] md:grid-cols-3">
		{#each plans as plan (plan.title)}
			<!-- Six rows per plan on a shared grid (subgrid): the rows of the three cards line up. -->
			<article
				class="row-span-6 grid grid-rows-subgrid gap-y-0 border bg-[color-mix(in_oklch,var(--tone)_8%,var(--bg,var(--background)))] p-[1.5rem]"
				style:--tone={plan.tone}
			>
				<h3 class="text-2xl! font-bold!">{plan.title}</h3>
				<p class="mt-[0.5rem]! text-sm text-dim">{plan.text}</p>
				<p class="mt-[2rem]! flex items-baseline gap-2">
					<span class="text-5xl font-bold">{plan.price}</span>
					{#if plan.unit}<span class="text-dim">{plan.unit}</span>{/if}
				</p>
				<a
					href={plan.href}
					class="cta chip mt-[1.5rem] border px-3 py-2 text-center text-sm font-bold !hover:bg-white hover:text-bg!"
					class:filled={plan.filled}
					{...plan.external
						? { target: "_blank", rel: "noreferrer noopener" }
						: { rel: "external" }}
					>{plan.cta}{#if plan.external}<span class="sr-only"> {c.common.newTab}</span
						>{/if}</a
				>
				<div class="mt-[0.5rem] text-xs text-dim">
					{#if plan.terms}<a
							href={PLEIADES_TERMS_URL}
							rel="external"
							class="underline! underline-offset-[3px]">{t.business.terms}</a
						>{/if}
					{#if plan.prices}<PricesDialog />{/if}
				</div>
				<div class="mt-[1.5rem] text-sm">
					{#if plan.listTitle}<p class="mb-[0.75rem]! text-xs text-dim">{plan.listTitle}</p>{/if}
					<ul class="flex flex-col gap-2">
						{#each plan.includes as item (item)}
							{@const [name, gain] = item.split(" — ")}
							<li class="flex items-start gap-3">
								<span class="grid size-[1.5rem] flex-none place-items-center rounded-full bg-[color-mix(in_oklch,var(--tone)_20%,transparent)] text-(--tone)"><CheckIcon size={14} aria-hidden="true" /></span>
								<span>{#if gain}<b>{name}</b> — {gain}{:else}{item}{/if}</span>
							</li>
						{/each}
					</ul>
				</div>
			</article>
		{/each}
	</div>
</Pane>

<style>
	/* Outweighs the global `.chip` colours (border, hover) that the utilities would lose to. */
	.cta {
		border-color: var(--tone);
	}
	.cta.filled {
		/* Darkened like --primary-shade: light text on the bare tone is below 4.5:1. */
		background: color-mix(in oklch, var(--tone), black var(--shade-strong));
		color: var(--bg, var(--background));
	}
</style>
