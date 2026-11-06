<script lang="ts">
	import { BarChart } from "layerchart";
	import { useIntlayer } from "svelte-intlayer";
	import * as Chart from "#lib/components/ui/chart/index.js";
	import type { SpendUnit } from "#lib/i18n/format.js";
	import { useFormat } from "#lib/i18n/use-format.js";

	/** Stacked input/output tokens per day, or (`metric="cost"`) the day's spend. Days without calls are simply absent. */
	let {
		rows,
		metric = "tokens",
		unit = "usd",
	}: {
		rows: {
			day: string;
			inputTokens: number;
			outputTokens: number;
			costUsd?: number | null;
		}[];
		metric?: "tokens" | "cost";
		/** What the cost metric is shown in: staff see dollars, customers trenni. */
		unit?: SpendUnit;
	} = $props();

	const content = useIntlayer("charts");
	const format = useFormat();

	const config = $derived({
		inputTokens: { label: $content.inputTokens.value, color: "var(--chart-1)" },
		outputTokens: {
			label: $content.outputTokens.value,
			color: "var(--chart-2)",
		},
		costUsd: {
			label: unit === "tr" ? $content.spendTr.value : $content.spend.value,
			color: "var(--chart-3)",
		},
	} satisfies Chart.ChartConfig);
</script>

{#if rows.length === 0}
	<p class="text-sm text-muted-foreground">{$content.noModelCalls.value}</p>
{:else}
	<Chart.Container {config} class="h-64 w-full">
		<BarChart
			padding={{ top: 8, right: 12, bottom: 28, left: 56 }}
			props={{ yAxis: { format: (value: number) => metric === "cost" ? $format.spend(unit).short(value) : $format.compact(value) } }}
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
				<Chart.Tooltip valueFormatter={metric === "cost" ? $format.spend(unit).exact : undefined} />
			{/snippet}
		</BarChart>
	</Chart.Container>
{/if}
