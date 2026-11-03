<script lang="ts">
	import BookOpenIcon from "@lucide/svelte/icons/book-open";
	// Lucide has no brand icons (GitHub included).
	import CodeXmlIcon from "@lucide/svelte/icons/code-xml";
	import FlaskConicalIcon from "@lucide/svelte/icons/flask-conical";
	import LogInIcon from "@lucide/svelte/icons/log-in";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RocketIcon from "@lucide/svelte/icons/rocket";
	import { poppinsBold, poppinsRegular } from "@repo/ui/font-preloads.ts";
	import { onMount } from "svelte";
	import LandingWidgetDemo from "#lib/components/landing/LandingWidgetDemo.svelte";
	import { localeFromPath, localizeHref } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { PLEIADES_PANEL_LOGIN_URL, PLEIADES_REPO_URL } from "#lib/site.js";
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

<svelte:head>
    <!-- The poster is the LCP element: ask for it with the HTML, not after the CSS. -->
    <link rel="preload" as="image" href="/media/draft-poster.webp" fetchpriority="high"/>
    <!-- The hero's own faces: swapping them in late shifted the hero (CLS on phones). -->
    <link rel="preload" as="font" type="font/woff2" href={poppinsBold} crossorigin="anonymous"/>
    <link rel="preload" as="font" type="font/woff2" href={poppinsRegular} crossorigin="anonymous"/>
</svelte:head>

<section
        class="flex min-h-[calc(100vh-(var(--po-nav)+var(--po-landing-nav)))] w-full"
        aria-label={t.aria}
>
    <!-- Text in flow, video behind it: the section grows on phones instead of cutting the text off. -->
    <div class="relative flex w-full bg-black">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
                bind:this={video}
                class="absolute inset-0 h-full w-full object-cover"
                autoplay
                loop
                muted
                playsinline
                preload="metadata"
                poster="/media/draft-poster.webp"
                onplay={() => (playing = true)}
                onpause={() => (playing = false)}
                aria-hidden="true"
                tabindex="-1"
        >
            <!-- The first matching source wins: phones get the 480p cut. -->
            <source
                    src="/media/draft-480.webm"
                    type="video/webm; codecs=vp9"
                    media="(max-width: 640px)"
            />
            <source src="/media/draft.webm" type="video/webm; codecs=vp9"/>
        </video>

        <div
                class="relative flex w-full flex-wrap content-end items-end justify-between gap-6 p-4 sm:p-8 bg-linear-to-t/srgb from-bg from-7% to-transparent max-md:to-bg/70"
        >
            <div class="flex max-w-full flex-col gap-4">
                <!-- The logo stays outside the h1: its mix-blend would invert the logo's colours. -->
                <div class="flex items-center gap-3 sm:gap-4">
                    <h1 class="sr-only">PleiadesOrchestra</h1>
                    <div aria-hidden="true" class="text-[clamp(2rem,8vw,4rem)] font-bold leading-none text-white mix-blend-difference">PleiadesOrchestra</div>
                </div>
                <p class="max-w-2xl text-sm  sm:text-base">{t.lead}</p>
                <p class="text-xs">{t.early}</p>
                <div class="flex flex-wrap items-center gap-2 text-sm">
                    <a
                            href="#pricing"
                            class="chip inline-flex items-center gap-1.5 border px-3 py-2 font-bold bg-(--primary-shade) text-bg! border-accent!"><RocketIcon size={16} aria-hidden="true" />{t.get}
                    </a>
                    <a
                            href={PLEIADES_REPO_URL} class="chip inline-flex items-center gap-1.5 border px-3 py-2 text-white bg-muted"
                            rel="external"
                    >
                        <CodeXmlIcon size={16} aria-hidden="true" />
                        {t.github}
                    </a
                    >
                    <a
						href={playgroundHref}
						class="chip inline-flex items-center gap-1.5 border px-3 py-2 text-white bg-muted"
                    >
                        <FlaskConicalIcon size={16} aria-hidden="true" />
                        {t.playground}
                    </a>
                    <a
						href={docsHref} class="chip inline-flex items-center gap-1.5 border px-3 py-2 text-white bg-muted"
                    >
                        <BookOpenIcon size={16} aria-hidden="true" />
                        {t.docs}
                    </a>
                    <a
						href={PLEIADES_PANEL_LOGIN_URL}
						class="chip inline-flex items-center gap-1.5 border px-3 py-2 text-white bg-muted"
						rel="external"
                    >
                        <LogInIcon size={16} aria-hidden="true" />
                        {t.panel}
                    </a>
                    <button type="button" class="chip inline-flex items-center gap-1.5 border px-3 py-2 text-white bg-muted" onclick={togglePlay}>
                        {#if playing}<PauseIcon size={16} aria-hidden="true" />{:else}<PlayIcon size={16} aria-hidden="true" />{/if}
                        {playing ? t.pause : t.play}
                    </button>
                </div>
            </div>

            <LandingWidgetDemo />
        </div>
    </div>
</section>
