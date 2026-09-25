<script lang="ts">
	import { BarChart } from "layerchart";
	import { useIntlayer } from "svelte-intlayer";
	import * as Chart from "$lib/components/ui/chart/index.js";
	import { useFormat } from "$lib/i18n/use-format";

	/** Stacked input/output tokens per day. Days without calls are simply absent. */
	let {
		rows,
	}: { rows: { day: string; inputTokens: number; outputTokens: number }[] } =
		$props();

	const content = useIntlayer("charts");
	const format = useFormat();

	const config = $derived({
		inputTokens: { label: $content.inputTokens.value, color: "var(--chart-1)" },
		outputTokens: {
			label: $content.outputTokens.value,
			color: "var(--chart-2)",
		},
	} satisfies Chart.ChartConfig);
</script>

{#if rows.length === 0}
	<p class="text-sm text-muted-foreground">{$content.noModelCalls.value}</p>
{:else}
	<Chart.Container {config} class="h-64 w-full">
		<BarChart
			props={{ yAxis: { format: (value: number) => $format.number(value) } }}
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
