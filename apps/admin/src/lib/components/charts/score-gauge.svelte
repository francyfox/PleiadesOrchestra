<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { scoreClass } from "$lib/system/audit";

	/** Lighthouse-style ring: 0..100, red < 50, orange < 90, green otherwise. */
	let {
		score,
		label,
		size = 96,
	}: { score: number; label: string; size?: number } = $props();

	const content = useIntlayer("charts");

	const RADIUS = 42;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

	const tone = $derived(
		{
			pass: "text-emerald-600 dark:text-emerald-400",
			average: "text-amber-500 dark:text-amber-400",
			fail: "text-red-600 dark:text-red-400",
			info: "text-muted-foreground",
		}[scoreClass(score / 100)],
	);
	const fill = $derived(
		{
			pass: "fill-emerald-600/10",
			average: "fill-amber-500/10",
			fail: "fill-red-600/10",
			info: "fill-muted",
		}[scoreClass(score / 100)],
	);
	const dash = $derived(
		(Math.max(0, Math.min(score, 100)) / 100) * CIRCUMFERENCE,
	);
</script>

<figure class="flex flex-col items-center gap-2">
	<svg
		width={size}
		height={size}
		viewBox="0 0 100 100"
		class={tone}
		role="img"
		aria-label={String($content.gaugeLabel({ label, score }))}
	>
		<circle cx="50" cy="50" r={RADIUS} class={fill} />
		<circle
			cx="50"
			cy="50"
			r={RADIUS}
			fill="none"
			stroke="currentColor"
			stroke-width="8"
			stroke-linecap="round"
			stroke-dasharray={`${dash} ${CIRCUMFERENCE}`}
			transform="rotate(-90 50 50)"
		/>
		<text
			x="50"
			y="50"
			text-anchor="middle"
			dominant-baseline="central"
			class="fill-current font-mono text-[28px] font-semibold"
		>
			{score}
		</text>
	</svg>
	<figcaption class="text-center text-sm">{label}</figcaption>
</figure>
