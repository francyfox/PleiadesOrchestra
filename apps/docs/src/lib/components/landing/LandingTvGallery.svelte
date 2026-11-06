<script lang="ts">
	import "photoswipe/style.css";
	import type PhotoSwipeLightbox from "photoswipe/lightbox";
	import { onDestroy, onMount } from "svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	// Screen rectangles on tv.webp (1672×941 px): [left, top, right, bottom].
	const SIZE = { w: 1672, h: 941 };
	const SCREENS: [number, number, number, number][] = [
		[283, 152, 445, 275],
		[573, 112, 735, 240],
		[913, 165, 1168, 368],
		[1355, 220, 1490, 320],
		[170, 340, 392, 508],
		[550, 312, 820, 522],
		[1357, 403, 1520, 525],
		[942, 460, 1190, 643],
		[147, 596, 425, 807],
		[603, 613, 800, 768],
		[920, 725, 1128, 815],
		[1302, 613, 1540, 783],
	];
	// Placeholder on every screen until the video poster loads (only the first screen gets it).
	const NO_SIGNAL = "/media/no-signal.webp";

	const MOVIES = [
		{
			ru: ["1241745642"],
			en: ["1241349081"],
		},
	];

	// shortcut: kk has no movie yet, falls back to en; add a kk key when it exists.
	const locale = localeFromPath(page.url.pathname);
	const lang = locale === "ru" ? "ru" : "en";
	const watch = landingContent(locale).video.watch;
	const movieId = MOVIES[0][lang][0];
	let cover = $state<string>();
	let lightbox: PhotoSwipeLightbox | undefined;

	onMount(async () => {
		// Vimeo oEmbed gives the poster; on failure the first screen keeps its placeholder.
		try {
			const res = await fetch(
				`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${movieId}`,
			);
			cover = (await res.json()).thumbnail_url;
		} catch {
			cover = undefined;
		}
		const { default: Lightbox } = await import("photoswipe/lightbox");
		const { default: Player } = await import("@vimeo/player");
		lightbox = new Lightbox({
			dataSource: [{ vimeo: movieId, width: 1280, height: 720 }],
			pswpModule: () => import("photoswipe"),
		});
		// The slide is a plain container; the Vimeo SDK fills it with the player when it opens.
		lightbox.on("contentActivate", ({ content }) => {
			if (
				content.data.vimeo &&
				content.element &&
				!content.element.querySelector("iframe")
			) {
				new Player(content.element, {
					id: Number(content.data.vimeo),
					responsive: true,
					autoplay: true,
				});
			}
		});
		lightbox.init();
	});

	onDestroy(() => lightbox?.destroy());

	const pct = (value: number, of: number) => `${(value / of) * 100}%`;
	const box = (i: number) => {
		const [left, top, right, bottom] = SCREENS[i];
		return `left: ${pct(left, SIZE.w)}; top: ${pct(top, SIZE.h)}; width: ${pct(right - left, SIZE.w)}; height: ${pct(bottom - top, SIZE.h)}`;
	};
</script>

<div id="gallery" class="px-4 py-10">
	<div class="container mx-auto max-w-5xl">
		<div class="relative w-full" style:aspect-ratio="{SIZE.w} / {SIZE.h}">
			<!-- Layers by z-index: thumbnails (0) behind the TV frame (10), clickable areas (20) on top. -->
			{#each SCREENS as _, i (i)}
				<div class="tv-screen group absolute" style={box(i)}>
					<div class="tv-thumb absolute inset-0 z-0 overflow-hidden transition-transform duration-300 ease-[ease] motion-safe:group-hover:scale-115">
						<img
							src={i === 0 && cover ? cover : NO_SIGNAL}
							alt=""
							class="h-full w-full object-cover"
						/>
					</div>
					<!-- Every screen opens the same video: one named tab stop, the rest only for the mouse. -->
					<button
						type="button"
						aria-label={i === 0 ? watch : undefined}
						aria-hidden={i === 0 ? undefined : "true"}
						tabindex={i === 0 ? undefined : -1}
						class="absolute inset-0 z-20 cursor-pointer border-0 bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2"
						onclick={() => lightbox?.loadAndOpen(0)}
					></button>
				</div>
			{/each}
			<!-- The frame is dark artwork: inverted on the light theme (the screens stay as they are). -->
			<!-- Sizes cut from tv.webp (the SCREENS rectangles are fractions, so any size fits); below the fold: lazy. -->
			<img
				src="/media/tv-1280.webp"
				srcset="/media/tv-640.webp 640w, /media/tv-1280.webp 1280w, /media/tv.webp 1672w"
				sizes="(max-width: 1280px) 100vw, 1280px"
				width={SIZE.w}
				height={SIZE.h}
				loading="lazy"
				decoding="async"
				alt=""
				class="pointer-events-none absolute inset-0 z-10 h-full w-full [html:not(.dark)_&]:invert"
			/>
		</div>
	</div>
</div>

<style>
	/* Hover on a screen zooms the thumbnail (utilities on the wrapper) and glitches it here, so the two transforms don't fight. */
	.tv-screen:hover .tv-thumb img {
		animation: tv-glitch 0.4s steps(2) infinite;
	}

	@keyframes tv-glitch {
		0% {
			transform: translate(0);
			filter: none;
		}
		25% {
			transform: translate(-4px, 1px);
			filter: drop-shadow(2px 0 rgba(255, 0, 0, 0.6)) drop-shadow(-2px 0 rgba(0, 255, 255, 0.6));
		}
		50% {
			transform: translate(3px, -1px) skewX(6deg);
			filter: contrast(1.4) brightness(1.2);
		}
		75% {
			transform: translate(-2px, 0);
			filter: drop-shadow(-2px 0 rgba(255, 0, 0, 0.6)) drop-shadow(2px 0 rgba(0, 255, 255, 0.6));
		}
		100% {
			transform: translate(0);
			filter: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.tv-screen:hover .tv-thumb img {
			animation: none;
		}
	}
</style>
