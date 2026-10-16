<script lang="ts">
	import { onMount } from "svelte";
	import { localeFromPath, localizeHref } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { PLEIADES_REPO_URL } from "#lib/site.js";
	import { page } from "$app/state";

	let t = $derived(landingContent(localeFromPath(page.url.pathname)).video);
	let playgroundHref = $derived(
		localizeHref("/playground", localeFromPath(page.url.pathname)),
	);

	let docsHref = $derived(
		localizeHref("/docs", localeFromPath(page.url.pathname)),
	);

	let video: HTMLVideoElement;
	let playing = $state(true);

	onMount(() => {
		// Respect reduced motion: no autoplay, the viewer starts it themselves.
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			video.pause();
			playing = false;
		}
	});

	function togglePlay() {
		if (video.paused) void video.play();
		else video.pause();
	}
</script>

<section
	class="h-[calc(100vh-(var(--po-nav)))] min-h-[28rem] w-full"
	aria-label={t.aria}
>
	<div class="relative h-full w-full bg-black">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={video}
			class="h-full w-full object-cover"
			autoplay
			loop
			muted
			playsinline
			preload="metadata"
			onplay={() => (playing = true)}
			onpause={() => (playing = false)}
			aria-label={t.videoAria}
		>
			<source src="/media/draft.webm" type="video/webm; codecs=vp9" />
		</video>

		<div
			class="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-4 sm:p-8"
			style:background="linear-gradient(to top, var(--bg) 0%, transparent 150%)"
		>
			<h1 class="text-3xl font-bold text-white sm:text-5xl mix-blend-difference">PleiadesOrchestra</h1>
			<p class="max-w-2xl text-sm text-white/80 sm:text-base">{t.lead}</p>
			<p class="text-xs text-white/70">{t.early}</p>
			<div class="flex flex-wrap items-center gap-2 text-sm">
				<a
					href="#pricing"
					class="chip border px-3 py-2 font-bold"
					style:background="var(--accent)"
					style:color="var(--bg)"
					style:border-color="var(--accent)">{t.get}</a
				>
				<a href={PLEIADES_REPO_URL} class="chip border px-3 py-2 text-white" rel="external"
					>{t.github}</a
				>
				<a href={playgroundHref} class="chip border px-3 py-2 text-white">{t.playground}</a>
				<a href={docsHref} class="chip border px-3 py-2 text-white">{t.docs}</a>
				<button type="button" class="chip border px-3 py-2 text-white" onclick={togglePlay}>
					{playing ? t.pause : t.play}
				</button>
			</div>
		</div>
	</div>
</section>
