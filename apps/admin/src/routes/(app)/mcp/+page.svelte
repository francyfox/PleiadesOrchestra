<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { goto } from "$app/navigation";
	import McpSitesTable from "$lib/components/mcp/mcp-sites-table.svelte";
	import { useLiveQuery } from "$lib/live/use-live-query.svelte";

	const content = useIntlayer("mcp");
	const live = useLiveQuery("mcp", () => ({}));
</script>

<div>
	<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
	<p class="mt-1 text-sm text-muted-foreground">{$content.hint.value}</p>
</div>

<McpSitesTable
	sites={live.current.items}
	onSelect={(id) => goto(`/mcp/${encodeURIComponent(id)}`)}
/>
