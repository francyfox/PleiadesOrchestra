<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import UsageChart from "#lib/components/charts/usage-chart.svelte";
	import FinanceSummary from "#lib/components/dashboard/finance-summary.svelte";
	import UsageSummary from "#lib/components/dashboard/usage-summary.svelte";
	import UsageTable from "#lib/components/dashboard/usage-table.svelte";
	import * as Card from "#lib/components/ui/card/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import { useLiveQuery } from "#lib/live/use-live-query.svelte.js";

	const live = useLiveQuery("dashboard", () => ({}));
	const dashboard = $derived(live.current);

	const content = useIntlayer("dashboard");
	const format = useFormat();
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>

<UsageSummary stats={dashboard.stats} />

{#if dashboard.finance}
	<FinanceSummary finance={dashboard.finance} />
{/if}

<Card.Root>
	<Card.Header><Card.Title>{$content.usageByDay.value}</Card.Title></Card.Header>
	<Card.Content><UsageChart rows={dashboard.byDay} /></Card.Content>
</Card.Root>

{#if dashboard.byDay.some((day) => day.costUsd !== null)}
	<Card.Root>
		<Card.Header>
			<Card.Title>{$content.spendByDay({ total: $format.usd(dashboard.byDay.reduce((sum, day) => sum + (day.costUsd ?? 0), 0)) })}</Card.Title>
		</Card.Header>
		<Card.Content><UsageChart rows={dashboard.byDay} metric="cost" /></Card.Content>
	</Card.Root>
{/if}

<div class="grid gap-4 lg:grid-cols-2">
	<section class="grid min-w-0 gap-2">
		<h2 class="font-medium">{$content.topVisitors.value}</h2>
		<UsageTable rows={dashboard.topVisitors} groupBy="visitor" />
	</section>
	<section class="grid min-w-0 gap-2">
		<h2 class="font-medium">{$content.byChannel.value}</h2>
		<UsageTable rows={dashboard.byChannel} groupBy="channel" />
	</section>
</div>

<section class="grid min-w-0 gap-2">
	<h2 class="font-medium">{$content.byModel.value}</h2>
	<UsageTable rows={dashboard.byModel} groupBy="model" />
	<p class="text-xs text-muted-foreground">{$content.pricesNote.value}</p>
</section>

