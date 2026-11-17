<script lang="ts">
	import { onMount } from "svelte";
	import { ISO_CSS, translateAlong } from "../../movie/iso/iso-kit.ts";
	import {
		back,
		carriage,
		frontPost,
		H,
		LAMPS,
		LOGO_SIZE,
		LOGOS,
		label,
		logoTransform,
		P,
		plateAt,
		upper,
		W,
	} from "../../movie/splash-figure.ts";
	import { CARD_AT, cuesBetween, poseAt } from "../../movie/splash-pose.ts";
	import { createSplashSound } from "../../movie/splash-sound.ts";

	let {
		t,
		volume = 0.8,
		muted = false,
	}: { t: number; volume?: number; muted?: boolean } = $props();

	// Card boundaries in seconds; each card is keyed so its CSS animation restarts.
	const card = $derived(t < CARD_AT[0] ? 0 : t < CARD_AT[1] ? 1 : 2);
	// Low-fps look: the press and the camera only update this many times a second (sound and cards keep real time).
	const FPS = 8;
	const pose = $derived(poseAt(Math.floor(t * FPS) / FPS));
	// Camera sits where the stamp plate is (the plate is not drawn): it follows the head along the beam
	// and, as the head presses down, sinks and zooms in on the tray's logo. The view box stays W:H.
	const ZOOM = 2.2;
	const PUSH = 0.15; // extra zoom per world unit of dip
	const view = $derived.by(() => {
		const [cx, cy] = plateAt(pose.x, pose.dip);
		const zoom = ZOOM + pose.dip * PUSH;
		const w = W / zoom;
		const h = H / zoom;
		return `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;
	});

	const sound = createSplashSound();
	let last = t;
	$effect(() => {
		const now = t;
		if (!muted)
			for (const cue of cuesBetween(last, now)) sound.play(cue, volume);
		last = now;
	});
	onMount(() => sound.close);
</script>

<svelte:head>{@html `<style>${ISO_CSS}</style>`}</svelte:head>

<div class="splash" aria-hidden={false}>
	<svg class="iso iso-svg fig" viewBox={view} role="img" aria-label={label}>
		{@html back}
		{#each LOGOS as src, i}
			<image
				href={src}
				width={LOGO_SIZE}
				height={LOGO_SIZE}
				transform={logoTransform(i)}
				opacity={pose.inked[i]}
			/>
		{/each}
		{@html frontPost}
		<g transform={translateAlong(P, [pose.x, 0, 0])}>{@html carriage}{@html upper(pose.dip)}</g>
		{#each LAMPS as [cx, cy], i}
			<circle {cx} {cy} r="2" style="fill:var(--anatomy-{pose.inked[i] === 1 ? 'lit' : 'faint'})" />
		{/each}
	</svg>
	{#key card}
		<div class="card c{card}">
			{#if card === 0}
				<h2 class="word">shalotts</h2>
				<p class="tag">presents</p>
			{:else if card === 1}
				<h2 class="big">ELYSIA</h2>
				<p class="tag">end-to-end type safety</p>
			{:else}
				<h2 class="big">SVELTE</h2>
				<p class="tag">cybernetically enhanced</p>
			{/if}
		</div>
	{/key}
	<div class="scan"></div>
	<div class="vignette"></div>
</div>

<style>
.splash {
	position: absolute;
	inset: 0;
	background: #000;
	overflow: hidden;
	color: #ff7800;
}
.fig {
	position: absolute;
	left: 0;
	top: 3%;
	width: 100%;
	/* the isometric press: lit accent is the brand orange */
	--anatomy-lit: #ff7800;
	--anatomy-lit-top: #3a2210;
	--anatomy-lit-shade: #2b1a0e;
	--anatomy-page: #000;
}
.card {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 4cqw;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.6cqw;
	animation:
		pop 0.47s cubic-bezier(0.2, 1.6, 0.4, 1) both,
		flicker 0.12s steps(2) 0.47s 4,
		out 0.23s ease-in 1.2s forwards; /* the intro runs 1.5x faster (SPEED in splash-pose.ts) */
}
.word, .big {
	margin: 0;
	text-transform: uppercase;
	letter-spacing: 0.4cqw;
	text-shadow: 0 0 1.5cqw #ff7800, 0 0 4cqw #ff780080, 0.4cqw 0.4cqw 0 #30281d;
}
.word { font-size: 6cqw; }
.big { font-size: 8cqw; color: #ffd9a8; }
.tag {
	margin: 0;
	font-size: 2.6cqw;
	letter-spacing: 1cqw;
	color: #c9b99f;
	text-transform: lowercase;
}
.scan {
	position: absolute;
	inset: 0;
	pointer-events: none;
	background: repeating-linear-gradient(to bottom, rgb(0 0 0 / 0.35) 0 1px, transparent 1px 3px);
	animation: roll 6s linear infinite;
}
.vignette {
	position: absolute;
	inset: 0;
	pointer-events: none;
	background: radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / 0.85) 100%);
}
@keyframes pop {
	from { transform: scale(0.4); opacity: 0; filter: blur(1cqw) brightness(3); }
	to { transform: scale(1); opacity: 1; filter: none; }
}
@keyframes flicker {
	50% { opacity: 0.82; }
}
@keyframes out {
	to { opacity: 0; transform: scale(1.06); }
}
@keyframes roll {
	to { background-position-y: 12px; }
}
@media (prefers-reduced-motion: reduce) {
	.card, .scan { animation: none; }
}
</style>
