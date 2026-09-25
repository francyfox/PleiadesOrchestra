<script lang="ts">
	import EffectsTable from "$lib/components/goap/effects-table.svelte";
	import LlmCallsTable from "$lib/components/goap/llm-calls-table.svelte";
	import RunHeader from "$lib/components/goap/run-header.svelte";
	import RunPlanGraph from "$lib/components/goap/run-plan-graph.svelte";
	import RunTimeline from "$lib/components/goap/run-timeline.svelte";

	let { data } = $props();
</script>

<RunHeader run={data.details.run} />
<RunPlanGraph details={data.details} />
<RunTimeline run={data.details.run} events={data.details.events} />
<EffectsTable events={data.details.events} />
<LlmCallsTable calls={data.details.llmCalls} />
