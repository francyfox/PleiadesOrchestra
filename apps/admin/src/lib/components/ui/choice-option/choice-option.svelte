<script lang="ts">
	/**
	 * One option of a decision model's question: its key and probability, with
	 * a fill bar behind. The chosen one is highlighted, the others dimmed.
	 */
	let {
		label,
		value,
		ratio,
		chosen = false,
	}: {
		label: string;
		/** Already formatted, e.g. "72%". */
		value: string;
		/** 0..1, width of the fill bar. */
		ratio: number;
		chosen?: boolean;
	} = $props();
</script>

<div class="w-52">
	<div
		class={[
			"relative overflow-hidden rounded-md border px-2 py-1 text-xs",
			chosen
				? "border-emerald-500 bg-emerald-50 font-medium dark:bg-emerald-950"
				: "border-border bg-background opacity-60",
		]}
	>
		<div
			class={["absolute inset-y-0 left-0", chosen ? "bg-emerald-500/25" : "bg-muted"]}
			style:width="{Math.max(0, Math.min(1, ratio)) * 100}%"
		></div>
		<div class="relative flex items-center justify-between gap-2">
			<span class="truncate" title={label}>{label}</span>
			<span class="font-mono tabular-nums">{value}</span>
		</div>
	</div>
</div>
