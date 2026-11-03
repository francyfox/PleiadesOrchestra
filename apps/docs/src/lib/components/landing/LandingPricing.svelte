<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import {
		PLEIADES_BUY_URL,
		PLEIADES_CLOUD_CHECKOUT_URL,
		PLEIADES_CONTACT,
		PLEIADES_REPO_URL,
		PLEIADES_TERMS_URL,
	} from "#lib/site.js";
	import { page } from "$app/state";

	let c = $derived(landingContent(localeFromPath(page.url.pathname)));
	let t = $derived(c.pricing);

	const buyHref =
		PLEIADES_BUY_URL ||
		`mailto:${PLEIADES_CONTACT}?subject=PleiadesOrchestra%20commercial%20license`;
	// Keep in sync with the Polar product behind PLEIADES_BUY_URL.
	const price = "$800";
	// Keep in sync with the Polar product behind PLEIADES_CLOUD_CHECKOUT_URL.
	const cloudPrice = "$20";

	let plans = $derived([
		{
			title: t.cloud.title,
			text: t.cloud.text,
			price: cloudPrice,
			unit: `/ ${t.cloud.perMonth}`,
			cta: t.cloud.soon,
			href: PLEIADES_CLOUD_CHECKOUT_URL,
			external: true,
			includes: Object.values(t.cloud.includes),
			listTitle: t.cloud.listTitle,
			tone: "var(--accent-2)",
			filled: true,
			terms: false,
			// Cloud is not open yet: the CTA renders as a disabled button.
			disabled: true,
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
		},
	]);
</script>

<Pane title="guest@pleiades — pricing" header={false} id="pricing" class="!border-0 py-10">
	<h2 class="text-3xl! md:text-4xl! font-bold!">{t.heading}</h2>

	<div class="plans">
		{#each plans as plan (plan.title)}
			<article class="plan" style:--tone={plan.tone}>
				<h3 class="text-2xl! font-bold!">{plan.title}</h3>
				<p class="dim text-sm">{plan.text}</p>
				<p class="price flex items-baseline gap-2">
					<span class="text-5xl font-bold">{plan.price}</span>
					{#if plan.unit}<span class="dim">{plan.unit}</span>{/if}
				</p>
				{#if plan.disabled}<button
						type="button"
						disabled
						class="cta chip border px-3 py-2 text-center text-sm font-bold"
						class:filled={plan.filled}>{plan.cta}</button
					>{:else}<a
					href={plan.href}
					class="cta chip border px-3 py-2 text-center text-sm font-bold !hover:bg-white !hover:text-black"
					class:filled={plan.filled}
					{...plan.external
						? { target: "_blank", rel: "noreferrer noopener" }
						: { rel: "external" }}
					>{plan.cta}{#if plan.external}<span class="sr-only"> {c.common.newTab}</span
						>{/if}</a
				>{/if}
				<p class="dim text-xs">
					{#if plan.terms}<a
							href={PLEIADES_TERMS_URL}
							rel="external"
							class="underline! underline-offset-[3px]">{t.business.terms}</a
						>{/if}
				</p>
				<div class="features text-sm">
					{#if plan.listTitle}<p class="list-title dim text-xs">{plan.listTitle}</p>{/if}
					<ul class="flex flex-col gap-2">
						{#each plan.includes as item (item)}
							{@const [name, gain] = item.split(" — ")}
							<li class="flex items-start gap-3">
								<span class="check"><CheckIcon size={14} aria-hidden="true" /></span>
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
	.plans {
		display: grid;
		gap: 1rem;
		margin-top: 1.5rem;
	}
	@media (min-width: 768px) {
		.plans {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	.plan {
		display: grid;
		grid-row: span 6;
		grid-template-rows: subgrid;
		row-gap: 0;
		padding: 1.5rem;
		border: 1px solid var(--rule);
		background: color-mix(in oklch, var(--tone) 8%, var(--bg, var(--background)));
	}
	.plan > :nth-child(2) {
		margin-top: 0.5rem;
	}
	.price {
		margin-top: 2rem;
	}
	.cta {
		margin-top: 1.5rem;
	}
	.plan > :nth-child(5) {
		margin-top: 0.5rem;
	}
	.list-title {
		margin-bottom: 0.75rem;
	}
	.features {
		margin-top: 1.5rem;
	}
	.dim {
		color: var(--dim);
	}
	.cta {
		border-color: var(--tone);
	}
	.cta:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.cta.filled {
		/* Darkened like --primary-shade: light text on the bare tone is below 4.5:1. */
		background: color-mix(in oklch, var(--tone), black var(--shade-strong));
		color: var(--bg, var(--background));
	}
	.check {
		display: grid;
		flex: none;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		background: color-mix(in oklch, var(--tone) 20%, transparent);
		color: var(--tone);
	}
</style>
