<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import UsageChart from "$lib/components/charts/usage-chart.svelte";
	import UsageSummary from "$lib/components/dashboard/usage-summary.svelte";
	import UsageTable from "$lib/components/dashboard/usage-table.svelte";
	import * as Card from "$lib/components/ui/card/index.js";

	let { data } = $props();

	const content = useIntlayer("dashboard");
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>

<UsageSummary stats={data.stats} />

<Card.Root>
	<Card.Header><Card.Title>{$content.usageByDay.value}</Card.Title></Card.Header>
	<Card.Content><UsageChart rows={data.byDay} /></Card.Content>
</Card.Root>

<div class="grid gap-4 lg:grid-cols-2">
	<section class="grid gap-2">
		<h2 class="font-medium">{$content.topUsers.value}</h2>
		<UsageTable rows={data.topUsers} groupBy="user" />
	</section>
	<section class="grid gap-2">
		<h2 class="font-medium">{$content.byChannel.value}</h2>
		<UsageTable rows={data.byChannel} groupBy="channel" />
	</section>
</div>
