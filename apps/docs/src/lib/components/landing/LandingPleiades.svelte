<script lang="ts">
	import { onDestroy, onMount } from "svelte";

	let section: HTMLElement;
	let imageOffset = $state(0);
	let isVisible = $state(false);

	const parallaxFactor = 0.3;

	function handleScroll() {
		if (!section || !isVisible || typeof window === "undefined") return;
		const rect = section.getBoundingClientRect();
		imageOffset = rect.top * parallaxFactor;
	}

	function handleIntersection(entries: IntersectionObserverEntry[]) {
		const entry = entries[0];
		if (entry.isIntersecting && !isVisible) {
			isVisible = true;
			window.addEventListener("scroll", handleScroll, { passive: true });
			handleScroll();
		} else if (!entry.isIntersecting && isVisible) {
			isVisible = false;
			window.removeEventListener("scroll", handleScroll);
		}
	}

	onMount(() => {
		if (typeof window === "undefined") return;
		const observer = new IntersectionObserver(handleIntersection, {
			threshold: 0.1,
		});
		if (section) observer.observe(section);
	});

	onDestroy(() => {
		if (typeof window === "undefined") return;
		window.removeEventListener("scroll", handleScroll);
	});
</script>

<section
	bind:this={section}
	class="vhs my-10 relative w-full h-[40vh] overflow-hidden bg-white/5"
>
	<div
		class="absolute inset-0 w-full flex justify-center"
		style="transform: translateY({imageOffset}px); will-change: transform"
	>
		<img
			src="/media/cover.webp"
			alt="Pleiades maids illustration"
			class="h-[500px] opacity-80"
		/>
	</div>

	<div class="absolute inset-0"></div>
</section>

<style>
	/* CRT look: scanlines + vignette (::before), rolling bar (::after), colour fringe and jitter on the image */
	.vhs {
		isolation: isolate;
	}

	.vhs::before {
		content: "";
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		background:
			repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 0 1px, transparent 1px 3px),
			radial-gradient(ellipse at center, transparent 55%, rgba(255, 255, 255, 0.3));
	}

	.vhs::after {
		content: "";
		position: absolute;
		left: 0;
		right: 0;
		height: 25%;
		z-index: 3;
		pointer-events: none;
		background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.1), transparent);
		animation: vhs-roll 6s linear infinite;
	}

	.vhs img {
		position: relative;
		top: -15vh;
		filter: drop-shadow(2px 0 rgba(255, 0, 0, 0.5)) drop-shadow(-2px 0 rgba(0, 255, 255, 0.5));
		animation: vhs-jitter 2.4s steps(1) infinite;
	}

	.vhs::before {
		animation: vhs-flicker 1.7s steps(1) infinite;
	}

	@keyframes vhs-roll {
		from {
			top: -25%;
		}
		to {
			top: 100%;
		}
	}

	@keyframes vhs-jitter {
		0%, 14%, 27%, 41%, 58%, 73%, 100% {
			transform: translateX(0) skewX(0);
		}
		5% {
			transform: translateX(-6px) skewX(4deg);
		}
		9% {
			transform: translateX(5px) skewX(-3deg);
		}
		21% {
			transform: translateX(-10px);
		}
		34% {
			transform: translateX(8px) skewX(6deg);
		}
		49% {
			transform: translateX(-4px);
		}
		66% {
			transform: translateX(12px) skewX(-5deg);
		}
		81% {
			transform: translateX(-7px);
		}
		90% {
			transform: translateX(3px) skewX(2deg);
		}
	}

	@keyframes vhs-flicker {
		0%, 63%, 100% {
			opacity: 1;
		}
		8% {
			opacity: 0.6;
		}
		17% {
			opacity: 0.9;
		}
		44% {
			opacity: 0.75;
		}
		78% {
			opacity: 0.85;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.vhs::before,
		.vhs::after,
		.vhs img {
			animation: none;
		}
	}
</style>
