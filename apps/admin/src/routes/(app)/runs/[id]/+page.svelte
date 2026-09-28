<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import EffectsTable from "$lib/components/goap/effects-table.svelte";
	import LlmCallsTable from "$lib/components/goap/llm-calls-table.svelte";
	import RunHeader from "$lib/components/goap/run-header.svelte";
	import RunPlanGraph from "$lib/components/goap/run-plan-graph.svelte";
	import RunTimeline from "$lib/components/goap/run-timeline.svelte";
	import { prefetched } from "$lib/query/prefetch";
	import { queries } from "$lib/query/queries";

	let { data } = $props();

	const query = createQuery(() => queries.run(data.id));
	const details = $derived(prefetched(query));
</script>

<RunHeader run={details.run} />
<RunPlanGraph {details} />
<RunTimeline run={details.run} events={details.events} />
<EffectsTable events={details.events} />
<LlmCallsTable calls={details.llmCalls} />
