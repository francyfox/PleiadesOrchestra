<script lang="ts">
	/**
	 * One option of a decision model's question: its key and probability, with
	 * a fill bar behind. The chosen one is highlighted, the others dimmed.
	 * `question` (first option of a fan) is a small caption above.
	 */
	let {
		label,
		value,
		ratio,
		chosen = false,
		selected = false,
		question,
	}: {
		label: string;
		/** Already formatted, e.g. "72%". */
		value: string;
		/** 0..1, width of the fill bar. */
		ratio: number;
		chosen?: boolean;
		selected?: boolean;
		question?: string;
	} = $props();
</script>

<div class="w-52">
	{#if question}
		<div class="mb-1 truncate text-[10px] text-muted-foreground" title={question}>{question}</div>
	{/if}
	<div
		class={[
			"relative overflow-hidden rounded-md border px-2 py-1 text-xs",
			chosen
				? "border-emerald-500 bg-emerald-50 font-medium dark:bg-emerald-950"
				: "border-border bg-background opacity-60",
			selected ? "outline-2 outline-offset-2 outline-primary" : "",
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
