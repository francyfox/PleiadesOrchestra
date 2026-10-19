<script lang="ts">
	import { BarChart } from "layerchart";
	import { useIntlayer } from "svelte-intlayer";
	import * as Chart from "#lib/components/ui/chart/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";

	/** Stacked input/output tokens per day, or (`metric="cost"`) the day's spend. Days without calls are simply absent. */
	let {
		rows,
		metric = "tokens",
	}: {
		rows: {
			day: string;
			inputTokens: number;
			outputTokens: number;
			costUsd?: number | null;
		}[];
		metric?: "tokens" | "cost";
	} = $props();

	const content = useIntlayer("charts");
	const format = useFormat();

	const config = $derived({
		inputTokens: { label: $content.inputTokens.value, color: "var(--chart-1)" },
		outputTokens: {
			label: $content.outputTokens.value,
			color: "var(--chart-2)",
		},
		costUsd: { label: $content.spend.value, color: "var(--chart-3)" },
	} satisfies Chart.ChartConfig);
</script>

{#if rows.length === 0}
	<p class="text-sm text-muted-foreground">{$content.noModelCalls.value}</p>
{:else}
	<Chart.Container {config} class="h-64 w-full">
		<BarChart
			props={{ yAxis: { format: (value: number) => metric === "cost" ? $format.usd(value) : $format.number(value) } }}
			data={rows}
			x="day"
			seriesLayout="stack"
			series={metric === "cost"
				? [{ key: "costUsd", label: config.costUsd.label, color: config.costUsd.color }]
				: [
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
