<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import UsageChart from "$lib/components/charts/usage-chart.svelte";
	import * as Card from "$lib/components/ui/card/index.js";
	import MessageList from "$lib/components/user-detail/message-list.svelte";
	import UsageByModelTable from "$lib/components/user-detail/usage-by-model-table.svelte";
	import UserHeader from "$lib/components/user-detail/user-header.svelte";
	import UserStats from "$lib/components/user-detail/user-stats.svelte";

	let { data } = $props();

	const content = useIntlayer("user-detail");
</script>

<UserHeader user={data.details.user} />

<UserStats user={data.details.user} />

<Card.Root>
	<Card.Header><Card.Title>{$content.usageByDay.value}</Card.Title></Card.Header>
	<Card.Content><UsageChart rows={data.details.usageByDay} /></Card.Content>
</Card.Root>

<section class="grid gap-2">
	<h2 class="font-medium">{$content.usageByModel.value}</h2>
	<UsageByModelTable rows={data.details.usageByModel} />
</section>

<MessageList messages={data.details.messages} />
