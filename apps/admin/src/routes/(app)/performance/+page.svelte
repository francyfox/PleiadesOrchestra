<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { CallKind } from "$lib/api-types";
	import LatencyChart from "$lib/components/charts/latency-chart.svelte";
	import LatencyOverview from "$lib/components/performance/latency-overview.svelte";
	import LatencyTable from "$lib/components/performance/latency-table.svelte";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Tabs from "$lib/components/ui/tabs/index.js";
	import { useLiveQuery } from "$lib/live/use-live-query.svelte";

	const live = useLiveQuery("performance", () => ({}));
	const report = $derived(live.current);

	const content = useIntlayer("performance");
	const common = useIntlayer("common");

	const KINDS: CallKind[] = ["generate", "ingest", "decision"];
	let selected = $state<CallKind>("generate");

	const rows = $derived(report.rows.filter((row) => row.kind === selected));
</script>

<div class="grid gap-1">
	<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
	<p class="text-sm text-muted-foreground">{$content.subtitle.value}</p>
</div>

<LatencyOverview overall={report.overall} kinds={KINDS} />

<Tabs.Root bind:value={selected}>
	<Tabs.List>
		{#each KINDS as kind (kind)}
			<Tabs.Trigger value={kind}>{$common.callKind[kind].value}</Tabs.Trigger>
		{/each}
	</Tabs.List>
</Tabs.Root>

<Card.Root>
	<Card.Header><Card.Title>{$content.chartTitle.value}</Card.Title></Card.Header>
	<Card.Content>
		{#key selected}
			<LatencyChart {rows} />
		{/key}
	</Card.Content>
</Card.Root>

<LatencyTable {rows} />
