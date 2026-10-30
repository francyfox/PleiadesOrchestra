<script lang="ts">
	import "photoswipe/style.css";
	import type PhotoSwipeLightbox from "photoswipe/lightbox";
	import { onDestroy, onMount } from "svelte";

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
	const ITEMS = ["cover", "alpha", "beta", "gamma"].map((name) => ({
		src: `/media/gallery-${name}.webp`,
		width: 1200,
		height: 756,
	}));

	let lightbox: PhotoSwipeLightbox | undefined;

	onMount(async () => {
		const { default: Lightbox } = await import("photoswipe/lightbox");
		lightbox = new Lightbox({
			dataSource: ITEMS,
			pswpModule: () => import("photoswipe"),
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

<section id="gallery" class="px-4 py-10">
	<div class="container mx-auto max-w-5xl">
		<div class="relative w-full" style:aspect-ratio="{SIZE.w} / {SIZE.h}">
			<!-- Layers by z-index: thumbnails (0) behind the TV frame (10), clickable areas (20) on top. -->
			{#each SCREENS as _, i (i)}
				<div class="tv-screen absolute" style={box(i)}>
					<div class="tv-thumb absolute inset-0 z-0 overflow-hidden">
						<img
							src={ITEMS[i % ITEMS.length].src}
							alt=""
							class="h-full w-full object-cover"
						/>
					</div>
					<button
						type="button"
						aria-label="Image {i + 1}"
						class="absolute inset-0 z-20 cursor-pointer border-0 bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2"
						onclick={() => lightbox?.loadAndOpen(i % ITEMS.length)}
					></button>
				</div>
			{/each}
			<img src="/media/tv.webp" alt="" class="pointer-events-none absolute inset-0 z-10 h-full w-full" />
		</div>
	</div>
</section>

<style>
	/* Hover on a screen zooms the thumbnail and glitches it; zoom sits on the wrapper so it doesn't fight the glitch transform. */
	.tv-thumb {
		transition: transform 0.3s ease;
	}
	.tv-screen:hover .tv-thumb {
		transform: scale(1.15);
	}
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
		.tv-screen:hover .tv-thumb {
			transform: none;
		}
		.tv-screen:hover .tv-thumb img {
			animation: none;
		}
	}
</style>
