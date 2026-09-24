<script lang="ts">
	import { BarChart } from "layerchart";
	import * as Chart from "$lib/components/ui/chart/index.js";

	/** Stacked input/output tokens per day. Days without calls are simply absent. */
	let {
		rows,
	}: { rows: { day: string; inputTokens: number; outputTokens: number }[] } =
		$props();

	const config = {
		inputTokens: { label: "Входные токены", color: "var(--chart-1)" },
		outputTokens: { label: "Выходные токены", color: "var(--chart-2)" },
	} satisfies Chart.ChartConfig;
</script>

{#if rows.length === 0}
	<p class="text-sm text-muted-foreground">За период вызовов модели не было.</p>
{:else}
	<Chart.Container {config} class="h-64 w-full">
		<BarChart
			data={rows}
			x="day"
			seriesLayout="stack"
			series={[
				{ key: "inputTokens", label: config.inputTokens.label, color: config.inputTokens.color },
				{ key: "outputTokens", label: config.outputTokens.label, color: config.outputTokens.color },
			]}
		>
			{#snippet tooltip()}
				<Chart.Tooltip />
			{/snippet}
		</BarChart>
	</Chart.Container>
{/if}
