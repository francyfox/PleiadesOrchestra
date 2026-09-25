<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import ScoreGauge from "$lib/components/charts/score-gauge.svelte";
	import * as Card from "$lib/components/ui/card/index.js";
	import type { MachineReport } from "$lib/system/audit";
	import AuditMarker from "./audit-marker.svelte";

	/** Overall + per-category rings and the Lighthouse legend. */
	let { report }: { report: MachineReport } = $props();

	const content = useIntlayer("recommendations");
</script>

<Card.Root>
	<Card.Content class="flex flex-row flex-wrap items-start justify-center gap-10 pt-6">
		<ScoreGauge score={report.score} label={$content.overall.value} size={120} />
		{#each report.categories as category (category.id)}
			<ScoreGauge score={category.score} label={$content.categories[category.id].value} />
		{/each}
	</Card.Content>
	<Card.Footer class="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
		<span class="flex items-center gap-1.5"><AuditMarker kind="fail" /> 0–49</span>
		<span class="flex items-center gap-1.5"><AuditMarker kind="average" /> 50–89</span>
		<span class="flex items-center gap-1.5"><AuditMarker kind="pass" /> 90–100</span>
		<span class="flex items-center gap-1.5"><AuditMarker kind="info" /> {$content.legend.info.value}</span>
	</Card.Footer>
</Card.Root>
