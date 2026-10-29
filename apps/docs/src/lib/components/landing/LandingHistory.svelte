<script lang="ts">
	import { Splide } from "@splidejs/splide";
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";
	import "@splidejs/splide/dist/css/splide-core.min.css";
	import { onMount } from "svelte";

	let c = $derived(landingContent(localeFromPath(page.url.pathname)));
	let t = $derived(c.history);

	// Facts checked against vendors' own docs/announcements; texts live in #lib/landing/content.ts,
	// in the same order as these sources.
	const sources = [
		"https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation",
		"https://shopify.dev/docs/apps/build/storefront-mcp/servers/storefront",
		"https://developers.hubspot.com/changelog/remote-hubspot-mcp-server-is-now-generally-available",
		"https://developer.salesforce.com/blogs/2026/04/salesforce-hosted-mcp-servers-are-now-generally-available",
		// No TypeSafe post of its own was found; launch coverage instead.
		"https://letsdatascience.com/news/typesafe-ai-launches-jev-decision-model-889a38c0",
	];

	let slider: HTMLElement;
	let splide: Splide | undefined;
	// The event in view: the timeline is filled down to it.
	let active = $state(0);

	onMount(() => {
		splide = new Splide(slider, {
			direction: "ttb",
			height: "16rem",
			perPage: 1,
			perMove: 1,
			arrows: false,
			// Our own bullets on the timeline, one per event.
			pagination: false,
			keyboard: "focused",
			wheel: true,
			// Slower, eased slides; a wheel or drag must be deliberate to move one event.
			speed: 800,
			easing: "cubic-bezier(0.22, 1, 0.36, 1)",
			wheelMinThreshold: 40,
			wheelSleep: 700,
			dragMinThreshold: { mouse: 30, touch: 40 },
			flickPower: 300,
			// At the first/last event the wheel scrolls the page again.
			releaseWheel: true,
			breakpoints: { 640: { height: "22rem" } },
		});
		splide.on("move", (index) => (active = index));
		splide.mount();
		return () => splide?.destroy();
	});
</script>

<section title="guest@pleiades — world market" id="history" class="min-h-screen flex items-center !border-0">
	<div class="container">
		<div
			class="flex h-full flex-col justify-center gap-10 lg:flex-row lg:items-center lg:justify-between"
		>
			<h2 class="flex flex-col gap-3 font-normal">
				<span class="text-3xl sm:text-4xl">{t.heading.line1}</span>
				<span class="pl-5 text-5xl sm:text-6xl">{t.heading.line2}</span>
			</h2>

			<!-- Timeline on the right: a progress fill down to the event in view, one bullet per event. -->
			<div class="relative w-full pr-10 lg:w-1/2">
				<span
					class="absolute inset-y-0 right-[9px] w-0.5 rounded-full"
					style:background="var(--rule)"
					aria-hidden="true"
				></span>
				<!-- Bullets sit at the middle of equal parts (justify-around): (i + 0.5) / n of the height. -->
				<!-- Transforms only, in step with the slide (speed/easing above): animating height or size re-laid out the page every frame and stuttered. -->
				<span
					class="absolute inset-y-0 right-[9px] w-0.5 origin-top rounded-full transition-transform duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
					style:transform="scaleY({(active + 0.5) / Object.keys(t.events).length})"
					style:background="var(--accent)"
					aria-hidden="true"
				></span>
				<div class="absolute inset-y-0 right-0 flex w-5 flex-col items-center justify-around">
					{#each Object.values(t.events) as event, i (event.title)}
						<!-- A 20px hit area around a small dot. -->
						<button
							type="button"
							class="grid h-5 w-5 cursor-pointer place-items-center border-0 bg-transparent p-0"
							aria-label={t.pageLabel.replace("%s", String(i + 1))}
							aria-current={i === active ? "step" : undefined}
							onclick={() => splide?.go(i)}
						>
							<span
								class={[
									"h-3 w-3 rounded-full transition-[transform,background-color] duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
								]}
								style:transform="scale({i === active ? 1 : i < active ? 0.67 : 0.33})"
								style:background={i <= active ? "var(--accent)" : "var(--dim)"}
								style:box-shadow={i === active
									? "0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent)"
									: undefined}
							></span>
						</button>
					{/each}
				</div>
				<!-- Splide: vertical, one event in view, wheel/drag/arrow keys move one at a time. -->
				<section class="splide" bind:this={slider} aria-label={`${t.heading.line1} ${t.heading.line2}`}>
				<div class="splide__track">
				<ul class="splide__list">
				{#each Object.values(t.events) as event, i (event.title)}
					<li class="splide__slide flex flex-col items-end justify-center text-right">
						{#if /^\d/.test(event.date)}
							<time class="text-xs" style:color="var(--accent-2)" datetime={event.date}
							>{event.date}</time
							>
						{:else}
							<span class="text-xs" style:color="var(--accent-2)">{event.date}</span>
						{/if}
						<h3 class="font-bold">{event.title}</h3>
						<p class="ml-auto max-w-2xl text-sm" style:color="var(--dim)">{event.text}</p>
						<ul class="mt-2 flex flex-wrap justify-end gap-1.5 text-xs" aria-label={t.canLabel}>
							{#each Object.values(event.can) as action (action)}
								<li class="chip border px-2 py-0.5">{action}</li>
							{/each}
						</ul>
						<a
								href={sources[i]}
								class="link-underline mt-1 inline-block text-xs"
								style:color="var(--dim)"
								rel="external noopener">{c.common.source}</a
						>
					</li>
				{/each}
				</ul>
				</div>
				</section>
			</div>
		</div>
	</div>
</section>

