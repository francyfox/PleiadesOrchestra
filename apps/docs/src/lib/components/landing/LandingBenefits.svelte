<script lang="ts">
	import { CodeBlock } from "@sveltepress/theme-default/components";
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath, localizeHref } from "#lib/i18n.js";
	import { STEP_SAMPLES, STEP_SHOTS } from "#lib/landing/benefits.data.js";
	import { landingContent } from "#lib/landing/content.js";
	import { useTabs } from "#lib/landing/flow.svelte.js";
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

	// Code and screenshot cards share one look.
	const CARD =
		"min-w-0 overflow-hidden rounded-[0.75rem] border bg-[radial-gradient(120%_120%_at_100%_0%,color-mix(in_oklch,var(--accent)_14%,transparent),transparent_70%)]";

	// Selected file tab per step.
	const codeTabs = STEP_SAMPLES.map((samples) =>
		useTabs(samples.map((s) => s.name)),
	);
</script>

<Pane title="guest@pleiades — benefits" header={false} id="benefits" class="py-10 !border-0 min-h-[70vh]">
	<div class="text-3xl md:text-6xl font-bold mb-10">{t.heading}</div>
	<!-- The timeline: one line through the markers (::before). -->
	<ol class="relative mt-8 grid before:absolute before:top-0 before:bottom-0 before:left-[1.25rem] before:w-px before:bg-(--rule) before:content-['']">
		{#each steps as step, i (step.title)}
			{@const parts = splitLink(step.text)}
			{@const samples = STEP_SAMPLES[i]}
			{@const shot = STEP_SHOTS[i]}
			{@const sample = samples.find((s) => s.name === codeTabs[i].tab) ?? samples[0]}
			<!-- Every step is as tall as the others, so scrolling from one to the next takes the same distance. -->
			<li
					class="relative grid min-h-[max(55vh,26rem)] content-start max-lg:grid-cols-1 max-lg:gap-[1rem] pl-[3.5rem]! transition-opacity duration-600 ease-[ease] motion-reduce:transition-none lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-[3rem] {current !== null && i > current ? 'opacity-15' : ''}"
					bind:this={stepElements[i]}
				>
				<span
					class="absolute top-0 left-0 grid size-[2.5rem] place-items-center rounded-full border font-bold transition-[background,color] duration-600 ease-[ease] {i === current
						? 'border-accent! bg-accent text-(--bg)'
						: 'bg-(--bg) text-accent'}"
					aria-hidden="true">{i + 1}</span>
				<div class="text">
					<h3 class="text-xl! font-bold!">{step.title}</h3>
					<p class="mt-2 text-dim">
						{parts.before}
						{#if parts.label}
							<a href={localizeHref(parts.href, locale)} class="text-accent! underline! underline-offset-[3px] hover:no-underline!">{parts.label}</a>{parts.after}
						{/if}
					</p>
				</div>
				{#if shot}
					<!-- Shrinks to a narrow shot (the widget panel); a wide one still fills the column. -->
					<figure class="{CARD} self-start justify-self-start {i === 3 ? 'max-h-[380px]' : ''}">
						<img
							src="/media/{shot.file}-{locale}.webp"
							alt={t[`${shot.file}Alt`]}
							width={shot.width}
							height={shot.height}
							loading="lazy"
							class="block h-auto max-w-full"
						/>
						<figcaption class="border-t px-[1rem] py-[0.5rem] text-[0.8rem] text-dim">{t[`${shot.file}Note`]}</figcaption>
					</figure>
				{:else}
				<div class={CARD}>
					{#if samples.length > 1}
						<div class="flex gap-[0.25rem] border-b px-[0.75rem]" role="tablist">
							{#each samples as s, j (s.name)}
								<button
									type="button"
									role="tab"
									id="benefit-tab-{i}-{j}"
									aria-controls="benefit-code-{i}"
									aria-selected={codeTabs[i].tab === s.name}
									tabindex={codeTabs[i].tab === s.name ? 0 : -1}
									class="cursor-pointer rounded-none! border-0! border-b-2! bg-transparent! px-[0.75rem]! py-[0.6rem]! text-[0.85rem]! {codeTabs[i].tab === s.name
										? 'border-b-accent! text-inherit!'
										: 'border-b-transparent! text-dim!'}"
									bind:this={codeTabs[i].buttons[j]}
									onclick={() => codeTabs[i].select(s.name)}
									onkeydown={(e) => codeTabs[i].onKey(e, j)}>{s.name}</button
								>
							{/each}
						</div>
					{/if}
					<!-- min-height: the code is highlighted in the browser, the card must not jump. -->
					<div
						class="overflow-x-auto px-[1rem] py-[0.75rem] text-[0.85rem] [&_pre]:m-0! [&_pre]:bg-transparent!"
						id="benefit-code-{i}"
						role={samples.length > 1 ? "tabpanel" : undefined}
						aria-labelledby={samples.length > 1 ? `benefit-tab-${i}-${samples.indexOf(sample)}` : undefined}
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
