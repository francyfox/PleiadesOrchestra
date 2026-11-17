<script lang="ts">
	import { CREDITS_LENGTH } from "../../movie/movie.storyboard.ts";

	let { t, start }: { t: number; start: number } = $props();

	const DURATION = CREDITS_LENGTH; // seconds for the full scroll
	const lines = [
		"Pleiades — pleiades.shalotts.site",
		"Inspired by StarSailor Four to The Floor",
		"Software: MikuMikuDance — Yu Higuchi (樋口優)",
		"Video to ANSI: movie2ansi — github.com/francyfox/movie2ansi",
		"Character models: adamaki",
		"Drum set model: Drumaster (どら)",
		"Bass guitar model: kaz (paperguitar.com)",
		"Guitar motion: Cyber Nyan (サイバーにゃん)",
		"Vocal/band motion: nico_keke",
		"Dance motion: from the collection github.com/bear0830/mmd (original author unknown)",
		"Overlord © Kugane Maruyama / KADOKAWA. Fan-made, non-commercial.",
	];

	const p = $derived(Math.min(1, Math.max(0, (t - start) / DURATION)));
</script>

<div class="credits">
	<!-- top is relative to the stage, translate to the block's own height: starts fully below, ends fully above -->
	<ul style:top="{(1 - p) * 100}%" style:transform="translateY({-p * 100}%)">
		{#each lines as line}
			<li>{line}</li>
		{/each}
	</ul>
</div>

<style>
.credits {
	position: absolute;
	inset: 0;
	background: #000;
	overflow: hidden;
}
ul {
	position: absolute;
	left: 0;
	right: 0;
	margin: 0;
	padding: 0 8cqw;
	list-style: none;
	text-align: center;
	color: #f3e9d8;
	font-size: 2.4cqw;
	line-height: 1.5;
	will-change: transform;
}
li { margin: 0 0 3cqw; }
li:first-child { color: #ff7800; font-size: 3.4cqw; }
</style>
