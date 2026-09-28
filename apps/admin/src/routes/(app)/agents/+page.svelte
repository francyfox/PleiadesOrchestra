<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import AgentsTable from "$lib/components/agents/agents-table.svelte";
	import { useLiveQuery } from "$lib/live/use-live-query.svelte";

	const live = useLiveQuery("agents", () => ({}));

	const content = useIntlayer("agents");
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
<p class="text-sm text-muted-foreground">{$content.subtitle.value}</p>

<AgentsTable agents={live.current.items} />
