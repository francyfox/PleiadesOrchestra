<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderComponent,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { BlockedIp, Channel } from "$lib/api-types";
	import CopyValue from "$lib/components/copy-value.svelte";
	import DataTable from "$lib/components/data-table.svelte";
	import { useFormat } from "$lib/i18n/use-format";
	import { whoisUrl } from "$lib/ip";
	import type { ServerPagination } from "$lib/pagination";
	import BlockedIpActions from "./blocked-ip-actions.svelte";

	let {
		items,
		channels,
		pagination,
	}: {
		items: BlockedIp[];
		channels: Channel[];
		pagination: ServerPagination;
	} = $props();

	const content = useIntlayer("blocked-ips");
	const format = useFormat();

	const channelName = (id: string | null) =>
		id
			? (channels.find((channel) => channel.id === id)?.name ?? id)
			: $content.allChannels.value;

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, BlockedIp>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("ip", {
				header: () => $content.columns.ip.value,
				cell: (ctx) => renderSnippet(ipCell, ctx.row.original),
			}),
			helper.accessor("ipHash", {
				header: () => $content.columns.ipHash.value,
				cell: (ctx) => renderSnippet(hashCell, ctx.row.original),
			}),
			helper.accessor("channelId", {
				header: () => $content.columns.channel.value,
				cell: (ctx) => channelName(ctx.getValue()),
			}),
			helper.accessor("reason", {
				header: () => $content.columns.reason.value,
			}),
			helper.accessor("createdAt", {
				header: () => $content.columns.created.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.accessor("expiresAt", {
				header: () => $content.columns.expires.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.display({
				id: "actions",
				cell: (ctx) =>
					renderComponent(BlockedIpActions, { item: ctx.row.original }),
			}),
		]),
		get data() {
			return items;
		},
	});
</script>

{#snippet ipCell(item: BlockedIp)}
	{#if item.ip}
		<CopyValue value={item.ip} href={whoisUrl(item.ip)} label={$content.copyIp.value} />
	{:else}
		<span class="text-muted-foreground" title={$content.legacyIp.value}>—</span>
	{/if}
{/snippet}

{#snippet hashCell(item: BlockedIp)}
	<CopyValue value={item.ipHash} label={$content.copyHash.value}>{item.ipHash.slice(0, 12)}…</CopyValue>
{/snippet}

<DataTable {table} emptyText={$content.empty.value} server={pagination} />
