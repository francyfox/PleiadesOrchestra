<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import UsageChart from "$lib/components/charts/usage-chart.svelte";
	import UsageSummary from "$lib/components/dashboard/usage-summary.svelte";
	import UsageTable from "$lib/components/dashboard/usage-table.svelte";
	import * as Card from "$lib/components/ui/card/index.js";
	import { useLiveQuery } from "$lib/live/use-live-query.svelte";

	const live = useLiveQuery("dashboard", () => ({}));
	const dashboard = $derived(live.current);

	const content = useIntlayer("dashboard");
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>

<UsageSummary stats={dashboard.stats} />

<Card.Root>
	<Card.Header><Card.Title>{$content.usageByDay.value}</Card.Title></Card.Header>
	<Card.Content><UsageChart rows={dashboard.byDay} /></Card.Content>
</Card.Root>

<div class="grid gap-4 lg:grid-cols-2">
	<section class="grid gap-2">
		<h2 class="font-medium">{$content.topUsers.value}</h2>
		<UsageTable rows={dashboard.topUsers} groupBy="user" />
	</section>
	<section class="grid gap-2">
		<h2 class="font-medium">{$content.byChannel.value}</h2>
		<UsageTable rows={dashboard.byChannel} groupBy="channel" />
	</section>
</div>
