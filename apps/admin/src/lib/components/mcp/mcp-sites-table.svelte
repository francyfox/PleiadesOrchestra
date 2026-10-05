<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { McpSite } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import { useFormat } from "$lib/i18n/use-format";

	/** The sites that announced WebMCP functions; clicking a row opens the site's own page. */
	let {
		sites,
		onSelect,
	}: {
		sites: McpSite[];
		onSelect: (channelId: string) => void;
	} = $props();

	const content = useIntlayer("mcp");
	const format = useFormat();

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, McpSite>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("channelName", {
				header: () => $content.sites.columns.site.value,
				cell: (ctx) => renderSnippet(siteCell, ctx.row.original),
			}),
			helper.accessor("toolCount", {
				header: () => $content.sites.columns.tools.value,
			}),
			helper.accessor("versions", {
				header: () => $content.sites.columns.versions.value,
			}),
			helper.accessor("registrations", {
				header: () => $content.sites.columns.announced.value,
			}),
			helper.accessor("firstSeenAt", {
				header: () => $content.sites.columns.changed.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.accessor("lastSeenAt", {
				header: () => $content.sites.columns.lastSeen.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
		]),
		get data() {
			return sites;
		},
	});
</script>

{#snippet siteCell(site: McpSite)}
	<div class="font-medium">{site.channelName}</div>
	<div class="text-xs text-muted-foreground">{site.channelSlug}</div>
{/snippet}

<DataTable
	{table}
	emptyText={$content.sites.empty.value}
	onRowClick={(site) => onSelect(site.channelId)}
/>
