<script lang="ts">
	import "@fontsource/wdxl-lubrifont-sc/index.css";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import Volume2Icon from "@lucide/svelte/icons/volume-2";
	import VolumeXIcon from "@lucide/svelte/icons/volume-x";
	import "@splidejs/splide/dist/css/splide-core.min.css";
	import { onMount } from "svelte";
	import {
		CAPTION_END,
		CREDITS_AT,
		INTRO_END,
		movie,
		MUSIC_AT,
	} from "../../movie/movie.storyboard.ts";
	import { useClock } from "../../movie/movie-clock.svelte.ts";
	import { useFramePopups } from "../../movie/movie-popups.svelte.ts";
	import { usePreload } from "../../movie/movie-preload.svelte.ts";
	import { useSlides } from "../../movie/movie-slides.svelte.ts";
	import Credits from "./Credits.svelte";
	import IntroSplash from "./IntroSplash.svelte";
	import Kenny from "./Kenny.svelte";

	const duration = movie.duration;
	let volume = $state(0.8);
	let muted = $state(false);
	let audio: HTMLAudioElement;
	let slider: HTMLElement;
	let stage: HTMLElement;

	const clock = useClock(() => audio, duration);
	const popups = useFramePopups({
		stage: () => stage,
		t: () => clock.t,
		playing: () => clock.playing,
		pause: () => clock.pause(),
	});
	const preload = usePreload(() => audio);
	const scene = $derived(movie.sceneIndexAt(clock.t));
	useSlides(
		() => slider,
		() => scene,
	);
	onMount(() => clock.stop); // onDestroy also runs in SSR, where rAF does not exist

	const t = $derived(clock.t);
	// The Ken Burns class is on only while a slide is shown (and during its fade-out), so its 10 s animation starts with the slide, not at page load.
	let leaving = $state(-1);
	let shown = -1;
	$effect(() => {
		if (scene !== shown) [leaving, shown] = [shown, scene];
	});
	const canPlay = $derived(popups.allowed && preload.ready);
	// timestamp as a number of seconds, like the storyboard's spans
	const stamp = (s: number) => s.toFixed(1);
	function play() {
		popups.clearBlocked();
		clock.play();
	}
</script>

<svelte:head><script type="module" src="/movie/ansi-player.js"></script></svelte:head>

<div class="movie">
	<audio bind:this={audio} {volume} {muted} preload="auto">
		<source src="/movie/music.opus" type="audio/ogg; codecs=opus" />
		<source src="/movie/music.m4a" type="audio/mp4" />
	</audio>
	<div class="stage" bind:this={stage}>
		<div class="splide" bind:this={slider}>
			<div class="splide__track">
				<ul class="splide__list">
					{#each movie.scenes as s, i}
						<li class="splide__slide">
							{#if s.look.src}
								{@const kb = i === scene || i === leaving ? s.look.className : ""}
								{#if s.look.src.endsWith(".m2a")}
									<ansi-player class={kb} src={s.look.src} glyph-opacity="0" autoplay loop></ansi-player>
								{:else}
									<img class={kb} src={s.look.src} alt="" />
								{/if}
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		</div>

		{#if clock.started && t < INTRO_END}
			<ansi-player class="bg" src="/movie/05_dance.m2a" autoplay loop></ansi-player>
		{/if}

		{#each movie.framesAt(t).filter((f) => f.mode === "div") as f (f.src + f.span[0])}
			<ansi-player
				class="frame"
				src={f.src}
				autoplay
				loop
				style="left:{f.box.x}%;top:{f.box.y}%;width:{f.box.w}%;height:{f.box.h}%;{f.background ? `background:${f.background};` : ''}{f.transform ? `transform:${f.transform};` : ''}"
			></ansi-player>
		{/each}

		{#if clock.started && t < INTRO_END}<IntroSplash {t} {volume} {muted} />{/if}
		<Kenny active={scene === 1} />
		{#if t >= MUSIC_AT + 1 && t < CAPTION_END}
			<div class="caption">
				<svg class="tri" viewBox="0 0 120 80" aria-hidden="true">
					<defs>
						<linearGradient id="tri-g" x1="0" y1="0" x2="1" y2="1">
							<stop offset="0" stop-color="#3fd23a" />
							<stop offset="1" stop-color="#0b6a1c" />
						</linearGradient>
					</defs>
					<g fill="url(#tri-g)" stroke="#b7f26a" stroke-width="3" stroke-linejoin="round">
						<path d="M4 6 L58 6 L20 74 Z" /> 
						<path d="M60 42 L106 42 L86 4 Z" />
					</g>
				</svg>
				<img src="/logo.svg" alt="" />
				<div>
					<b class="artist">PleiadesOrchestra</b>
					<i class="track">4ToTheFloor</i>
					<span class="label">He11izArt</span>
				</div>
			</div>
		{/if}
		{#if t >= CREDITS_AT}<Credits {t} start={CREDITS_AT} />{/if}

		{#if popups.blocked}
			<div class="ask" role="alert">
				<p>Allow pop-ups for this site, then try again.</p>
				<button onclick={play}>Try again</button>
			</div>
		{:else if !clock.started}
			<button class="big" onclick={() => play()} disabled={!canPlay} aria-label="Play">PLAY</button>
			<p class="hint">
				{!preload.ready
					? `Loading ${preload.percent}%`
					: popups.allowed
						? "Pop-ups are allowed."
						: "Allow pop-ups for this site, then reload"}
			</p>
		{:else if clock.ended}
			<button class="big" onclick={() => play()} aria-label="Replay">REPLAY</button>
		{/if}
	</div>

	<div class="controls">
		<button disabled={!canPlay} onclick={() => (clock.playing ? clock.pause() : play())} aria-label={clock.playing ? "Pause" : "Play"}>
			{#if clock.playing}<PauseIcon size={18} />{:else}<PlayIcon size={18} />{/if}
		</button>
		<span class="time">
		    <span>{ stamp(t) }</span>
			<span>/</span>
			<span>{ stamp(duration) }</span>
		</span>
		<input
			type="range"
			aria-label="Seek"
			min="0"
			max={duration}
			step="0.1"
			value={t}
			oninput={(e) => clock.seek(+e.currentTarget.value)}
		/>
		<button onclick={() => (muted = !muted)} aria-label={muted ? "Unmute" : "Mute"}>{#if muted}<VolumeXIcon size={18} />{:else}<Volume2Icon size={18} />{/if}</button>
		<input type="range" aria-label="Volume" min="0" max="1" step="0.05" bind:value={volume} class="vol" />
	</div>
</div>

<style>
	:global(body:has(.movie)) {
		background: #000;
	}
	.movie {
		position: fixed;
		inset: 0;
		z-index: 100000;
		background: #000;
		display: grid;
		grid-template-rows: 1fr auto;
		justify-items: center;
		align-items: center;
		color: #ddd;
		font-family: "WDXL Lubrifont SC", system-ui, sans-serif;
	}
	.stage {
		position: relative;
		aspect-ratio: 4 / 3;
		container-type: inline-size;
		width: min(100%, calc((100dvh - 50px) * 4 / 3));
		overflow: hidden;
		background: #000;
	}
	.frame {
		position: absolute;
		/* stencil on the wall: the black of the video drops out, the light cells print onto the photo */
		mix-blend-mode: screen;
	}
	.splide,
	.bg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.splide__track,
	.splide__list,
	.splide__slide {
		height: 100%;
	}
	.splide__slide {
		overflow: hidden;
	}
	.splide__slide img,
	.splide__slide ansi-player {
		width: 100%;
		height: 100%;
		object-fit: cover;
		/* the player's own rounded corners and clipping keep a moving layer off the GPU; the slide already clips */
		border-radius: 0;
		overflow: visible;
	}
	.bg {
		opacity: 0.45;
	}
	/* lower third of an early-2000s music channel: outlined artist, track under it, label in a box */
	.caption {
		position: absolute;
		left: 5cqw;
		bottom: 7cqw;
		display: flex;
		align-items: center;
		gap: 1.5cqw;
		animation: fade 1.2s ease-out;
		isolation: isolate;
	}
	.tri {
		position: absolute;
		left: 12cqw;
		top: -4cqw;
		width: 30cqw;
		z-index: -1;
		filter: drop-shadow(0 0.5cqw 0.8cqw #0008);
	}
	.caption img {
		height: 9cqw;
		filter: drop-shadow(0 0.4cqw 0.6cqw #0008);
	}
	.caption div {
		display: grid;
		justify-items: start;
		gap: 0.4cqw;
	}
	.caption b,
	.caption i,
	.caption span {
		font-weight: 700;
		text-transform: uppercase;
		paint-order: stroke fill;
		letter-spacing: 0.04em;
	}
	.artist {
		font-size: 5cqw;
		color: #ffe3cf;
		-webkit-text-stroke: 1.2cqw #b3271a;
		text-shadow: 0 0.6cqw 1cqw #0008;
	}
	.track {
		margin-left: 3cqw;
		font-size: 3.4cqw;
		color: #f4f06a;
		-webkit-text-stroke: 0.9cqw #3a3a05;
	}
	.label {
		margin-left: 1.5cqw;
		padding: 0.2cqw 1.2cqw;
		font-size: 2cqw;
		color: #0d1f5c;
		background: #8fb0ff;
		box-shadow: 0.4cqw 0.4cqw 0 #0d1f5c88;
	}
	.ask {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 1rem;
		padding: 2rem;
		text-align: center;
		background: #000c;
		color: #fff;
	}
	.ask p {
		margin: 0;
		font-size: 48px;
	}
	.ask button {
		padding: 0.6rem 1.2rem;
		font: inherit;
		color: #fff;
		background: #ff7800;
		border: 0;
		border-radius: 0.4rem;
		cursor: pointer;
	}
	.hint {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 8%;
		margin: 0;
		padding: 0 2rem;
		text-align: center;
		color: #bbb;
		font-size: 48px;
	}
	.big:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.big {
		position: absolute;
		inset: 0;
		margin: auto;
		width: max-content;
		height: max-content;
		padding: 0.4em 1.2em;
		border: 2px solid #fff;
		background: transparent;
		color: #fff;
		font: inherit;
		font-size: 48px;
		letter-spacing: 0.1em;
		cursor: pointer;
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 10px;
		width: min(100%, 960px);
		padding: 8px 12px;
	}
	.controls button {
		display: grid;
		place-items: center;
		font: inherit;
		background: none;
		border: 0;
		color: #fff;
		font-size: 16px;
		cursor: pointer;
	}
	.controls :focus-visible,
	.big:focus-visible {
		outline: 2px solid #ff7800;
	}
	.controls input[type="range"] {
		flex: 1;
		accent-color: #ff7800;
	}
	.controls .vol {
		max-width: 80px;
	}
	.time {
	    display: grid;
		grid-template-columns: 1fr 2px 1fr;
		gap: 3px;
	    width: 73px;
		font-variant-numeric: tabular-nums;
		font-size: 13px;
	}
	:global(.kb-in-left, .kb-in-right, .kb-up) {
		will-change: transform;
		backface-visibility: hidden;
	}
	:global(.kb-in-left) {
		animation: kb-in-left 10s linear forwards;
	}
	:global(.kb-in-right) {
		animation: kb-in-right 10s linear forwards;
	}
	:global(.kb-up) {
		animation: kb-up 10s linear forwards;
	}
	@keyframes -global-kb-in-left {
	    from {
			transform: scale(1);
		}
	 	to {
			transform: scale(1.5);
		}
	}
	@keyframes -global-kb-in-right {
		to {
			transform: translate3d(3%, 3%, 0) scale(1.18);
		}
	}
	@keyframes -global-kb-up {
		to {
			transform: translate3d(0, -3%, 0) scale(1.18);
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.kb-in-left),
		:global(.kb-in-right),
		:global(.kb-up),
		.caption {
			animation: none;
		}
	}
</style>
