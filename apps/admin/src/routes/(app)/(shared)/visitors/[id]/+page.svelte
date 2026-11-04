<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import UsageChart from "#lib/components/charts/usage-chart.svelte";
	import * as Card from "#lib/components/ui/card/index.js";
	import MessageList from "#lib/components/visitor-detail/message-list.svelte";
	import UsageByModelTable from "#lib/components/visitor-detail/usage-by-model-table.svelte";
	import VisitorHeader from "#lib/components/visitor-detail/visitor-header.svelte";
	import VisitorStats from "#lib/components/visitor-detail/visitor-stats.svelte";
	import { useLiveQuery } from "#lib/live/use-live-query.svelte.js";

	let { data } = $props();

	const live = useLiveQuery("visitor", () => ({ id: data.id }));
	const details = $derived(live.current);

	const content = useIntlayer("visitor-detail");
</script>

<VisitorHeader visitor={details.visitor} />

<VisitorStats visitor={details.visitor} />

<Card.Root>
	<Card.Header><Card.Title>{$content.usageByDay.value}</Card.Title></Card.Header>
	<Card.Content><UsageChart rows={details.usageByDay} /></Card.Content>
</Card.Root>

<section class="grid gap-2">
	<h2 class="font-medium">{$content.usageByModel.value}</h2>
	<UsageByModelTable rows={details.usageByModel} />
</section>

<MessageList visitorId={details.visitor.id} messages={details.messages} />
