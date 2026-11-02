<script lang="ts">
	import { CodeBlock } from "@sveltepress/theme-default/components";
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath, localizeHref } from "#lib/i18n.js";
	import { DASHBOARD_SHOT, STEP_SAMPLES } from "#lib/landing/benefits.data.js";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	let locale = $derived(localeFromPath(page.url.pathname));
	let t = $derived(landingContent(locale).benefits);
	let steps = $derived(Object.values(t.steps));
	// A step's text may contain one link written as [label](href), e.g. "needs [the polyfill](/docs/polyfill/)".
	const LINK = /\[([^\]]+)\]\(([^)]+)\)/;

	// Cuts the text into the words before the link, the link itself and the words after it.
	function splitLink(text: string) {
		const match = LINK.exec(text);
		if (!match) return { before: text, label: "", href: "", after: "" };

		const [markdown, label, href] = match;
		return {
			before: text.slice(0, match.index),
			label,
			href,
			after: text.slice(match.index + markdown.length),
		};
	}

	// Like a GSAP ScrollTrigger with start "top 50%": a step lights up when its top reaches the activation
	// line, a fraction of the way down the viewport. Steps above the line stay visible, the last one is "current".
	const ACTIVATION_LINE = 0.5;

	let stepElements = $state<HTMLElement[]>([]);
	// Index of the current step. null = the page has not measured yet (no JS, prerender): show everything.
	let current = $state<number | null>(null);

	function measureCurrentStep() {
		const line = window.innerHeight * ACTIVATION_LINE;
		// -1 = no step has reached the line yet.
		current = stepElements.findLastIndex(
			(el) => el.getBoundingClientRect().top <= line,
		);
	}

	$effect(() => {
		measureCurrentStep();
		window.addEventListener("scroll", measureCurrentStep, { passive: true });
		window.addEventListener("resize", measureCurrentStep);
		return () => {
			window.removeEventListener("scroll", measureCurrentStep);
			window.removeEventListener("resize", measureCurrentStep);
		};
	});

	// Selected file tab per step.
	let tab = $state<number[]>([]);
</script>

<Pane title="guest@pleiades — benefits" header={false} id="benefits" class="py-10 !border-0 min-h-[70vh]">
	<div class="text-3xl md:text-6xl font-bold mb-10">{t.heading}</div>
	<ol class="steps mt-8">
		{#each steps as step, i (step.title)}
			{@const parts = splitLink(step.text)}
			{@const samples = STEP_SAMPLES[i]}
			{@const sample = samples[tab[i] ?? 0]}
			<li
					class="step"
					class:dim={current !== null && i > current}
					class:lit={i === current}
					bind:this={stepElements[i]}
				>
				<span class="marker" aria-hidden="true">{i + 1}</span>
				<div class="text">
					<h3 class="text-xl! font-bold!">{step.title}</h3>
					<p class="mt-2 text-dim">
						{parts.before}
						{#if parts.label}
							<a href={localizeHref(parts.href, locale)} class="step-link">{parts.label}</a>{parts.after}
						{/if}
					</p>
				</div>
				{#if samples.length === 0}
					<figure class="card shot">
						<img
							src="/media/dashboard-{locale}.webp"
							alt={t.dashboardAlt}
							width={DASHBOARD_SHOT.width}
							height={DASHBOARD_SHOT.height}
							loading="lazy"
						/>
						<figcaption>{t.dashboardNote}</figcaption>
					</figure>
				{:else}
				<div class="card">
					{#if samples.length > 1}
						<div class="tabs" role="tablist">
							{#each samples as s, j (s.name)}
								<button
									type="button"
									role="tab"
									id="benefit-tab-{i}-{j}"
									aria-controls="benefit-code-{i}"
									aria-selected={(tab[i] ?? 0) === j}
									class:active={(tab[i] ?? 0) === j}
									onclick={() => (tab[i] = j)}>{s.name}</button
								>
							{/each}
						</div>
					{/if}
					<!-- min-height: the code is highlighted in the browser, the card must not jump. -->
					<div
						class="code"
						id="benefit-code-{i}"
						role={samples.length > 1 ? "tabpanel" : undefined}
						aria-labelledby={samples.length > 1 ? `benefit-tab-${i}-${tab[i] ?? 0}` : undefined}
						style:min-height="{sample.code.split('\n').length * 1.28 + 1.5}rem">
						{#key sample.code}
							<CodeBlock code={sample.code} lang={sample.lang} />
						{/key}
					</div>
				</div>
				{/if}
			</li>
		{/each}
	</ol>
</Pane>

<style>
	.steps {
		position: relative;
		display: grid;
	}
	/* The timeline: one line through the markers. */
	.steps::before {
		content: "";
		position: absolute;
		left: 1.25rem;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--rule);
	}
	.step {
		position: relative;
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
		padding-left: 3.5rem;
		/* Every step is as tall as the others, so scrolling from one to the next takes the same distance. */
		min-height: max(55vh, 26rem);
		align-content: start;
	}
	.step {
		transition: opacity 0.6s ease;
	}
	.step.dim {
		opacity: 0.15;
	}
	.step.lit .marker {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg, var(--background));
	}
	@media (prefers-reduced-motion: reduce) {
		.step {
			transition: none;
		}
	}
	.marker {
		position: absolute;
		left: 0;
		top: 0;
		width: 2.5rem;
		height: 2.5rem;
		display: grid;
		place-items: center;
		border: 1px solid var(--rule);
		border-radius: 50%;
		background: var(--bg, var(--background));
		color: var(--accent);
		font-weight: 700;
		transition: background 0.6s ease, color 0.6s ease;
	}
	.card {
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--rule);
		border-radius: 0.75rem;
		background: radial-gradient(
			120% 120% at 100% 0%,
			color-mix(in oklch, var(--accent) 14%, transparent),
			transparent 70%
		);
	}
	.shot {
		margin: 0;
		align-self: start;
	}
	.shot img {
		display: block;
		width: 100%;
		height: auto;
	}
	.shot figcaption {
		padding: 0.5rem 1rem;
		border-top: 1px solid var(--rule);
		color: var(--dim);
		font-size: 0.8rem;
	}
	.step-link {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.step-link:hover {
		text-decoration: none;
	}
	.tabs {
		display: flex;
		gap: 0.25rem;
		padding: 0 0.75rem;
		border-bottom: 1px solid var(--rule);
	}
	.tabs button {
		background: none;
		border: 0;
		border-radius: 0;
		padding: 0.6rem 0.75rem;
		border-bottom: 2px solid transparent;
		color: var(--dim);
		font-size: 0.85rem;
		cursor: pointer;
	}
	.tabs button.active {
		color: inherit;
		border-bottom-color: var(--accent);
	}
	.code {
		padding: 0.75rem 1rem;
		overflow-x: auto;
		font-size: 0.85rem;
	}
	/* Transparent so the card's gradient shows through; Shiki writes its own background inline. */
	.code :global(pre) {
		background: transparent !important;
		margin: 0;
	}
	@media (min-width: 1024px) {
		.step {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
			gap: 3rem;
		}
	}
</style>
