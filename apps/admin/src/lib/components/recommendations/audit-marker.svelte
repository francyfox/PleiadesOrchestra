<script lang="ts">
	import type { ScoreClass } from "$lib/system/audit";

	/** Lighthouse shapes: ▲ fail, ■ average, ● pass, ○ informational. */
	let { kind }: { kind: ScoreClass } = $props();

	const TONE: Record<ScoreClass, string> = {
		pass: "text-emerald-600 dark:text-emerald-400",
		average: "text-amber-500 dark:text-amber-400",
		fail: "text-red-600 dark:text-red-400",
		info: "text-muted-foreground",
	};
</script>

<svg viewBox="0 0 12 12" class={`size-3 shrink-0 ${TONE[kind]}`} aria-hidden="true">
	{#if kind === "fail"}
		<polygon points="6,1 11,11 1,11" fill="currentColor" />
	{:else if kind === "average"}
		<rect x="1.5" y="1.5" width="9" height="9" fill="currentColor" />
	{:else if kind === "pass"}
		<circle cx="6" cy="6" r="5" fill="currentColor" />
	{:else}
		<circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
	{/if}
</svg>
