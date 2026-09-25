<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import AuditList from "$lib/components/recommendations/audit-list.svelte";
	import ComparisonTable from "$lib/components/recommendations/comparison-table.svelte";
	import ScoreOverview from "$lib/components/recommendations/score-overview.svelte";

	let { data } = $props();

	const content = useIntlayer("recommendations");
</script>

<div class="grid gap-1">
	<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
	<p class="text-sm text-muted-foreground">{$content.subtitle.value}</p>
</div>

<ScoreOverview report={data.report} />
<ComparisonTable rows={data.report.comparison} />
<AuditList report={data.report} />
