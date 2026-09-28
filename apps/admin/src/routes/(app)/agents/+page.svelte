<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import AgentsTable from "$lib/components/agents/agents-table.svelte";

	let { data } = $props();

	const content = useIntlayer("agents");
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
<p class="text-sm text-muted-foreground">{$content.subtitle.value}</p>

<AgentsTable agents={data.agents} />
