<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { goto } from "$app/navigation";
	import McpSitesTable from "$lib/components/mcp/mcp-sites-table.svelte";
	import McpToolsTable from "$lib/components/mcp/mcp-tools-table.svelte";
	import { useLiveQuery } from "$lib/live/use-live-query.svelte";

	let { data } = $props();

	const content = useIntlayer("mcp");
	const live = useLiveQuery("mcp", () => ({}));

	const sites = $derived(live.current.items);
	// No `?id=`: the first site, so the page is never an empty shell.
	const selected = $derived(
		sites.find((site) => site.channelId === data.id) ?? sites[0] ?? null,
	);
</script>

<div>
	<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
	<p class="mt-1 text-sm text-muted-foreground">{$content.hint.value}</p>
</div>

<h2 class="text-lg font-semibold">{$content.sites.title.value}</h2>
<McpSitesTable
	{sites}
	selectedId={selected?.channelId ?? null}
	onSelect={(id) => goto(`?id=${encodeURIComponent(id)}`, { noScroll: true, keepFocus: true })}
/>

{#if selected}
	<h2 class="text-lg font-semibold">
		{$content.tools.title({ site: selected.channelName })}
	</h2>
	<McpToolsTable tools={selected.tools} />
{/if}
