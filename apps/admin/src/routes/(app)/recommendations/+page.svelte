<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import AuditList from "$lib/components/recommendations/audit-list.svelte";
	import ComparisonTable from "$lib/components/recommendations/comparison-table.svelte";
	import ScoreOverview from "$lib/components/recommendations/score-overview.svelte";
	import { prefetched } from "$lib/query/prefetch";
	import { queries } from "$lib/query/queries";
	import { auditMachine } from "$lib/system/audit";

	const system = createQuery(() => queries.system());
	const report = $derived(auditMachine(prefetched(system)));

	const content = useIntlayer("recommendations");
</script>

<div class="grid gap-1">
	<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
	<p class="text-sm text-muted-foreground">{$content.subtitle.value}</p>
</div>

<ScoreOverview report={report} />
<ComparisonTable rows={report.comparison} />
<AuditList {report} />
