<script lang="ts">
	import { LineChart } from "layerchart";
	import { useIntlayer } from "svelte-intlayer";
	import * as Chart from "$lib/components/ui/chart/index.js";
	import { useFormat } from "$lib/i18n/use-format";

	/** p50/p90/p99 latency per day for one call kind. Days without calls are absent. */
	let {
		rows,
	}: { rows: { day: string; p50: number; p90: number; p99: number }[] } =
		$props();

	const content = useIntlayer("charts");
	const format = useFormat();

	const config = {
		p50: { label: "p50", color: "var(--chart-1)" },
		p90: { label: "p90", color: "var(--chart-2)" },
		p99: { label: "p99", color: "var(--chart-3)" },
	} satisfies Chart.ChartConfig;

	// Dates (not strings) so the chart uses a time scale with honest gaps.
	const data = $derived(
		rows.map((row) => ({ ...row, date: new Date(`${row.day}T00:00:00Z`) })),
	);
</script>

{#if rows.length === 0}
	<p class="text-sm text-muted-foreground">{$content.noCalls.value}</p>
{:else}
	<Chart.Container {config} class="h-64 w-full">
		<LineChart
			{data}
			x="date"
			series={[
				{ key: "p50", label: config.p50.label, color: config.p50.color },
				{ key: "p90", label: config.p90.label, color: config.p90.color },
				{ key: "p99", label: config.p99.label, color: config.p99.color },
			]}
			props={{
				spline: { strokeWidth: 2 },
				xAxis: { format: "day" },
				yAxis: { format: (value: number) => $format.ms(value) },
			}}
			points
		>
			{#snippet tooltip()}
				<Chart.Tooltip />
			{/snippet}
		</LineChart>
	</Chart.Container>
{/if}
