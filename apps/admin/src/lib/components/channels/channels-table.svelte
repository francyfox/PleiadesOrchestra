<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderComponent,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { Channel } from "$lib/api-types";
	import CopyValue from "$lib/components/copy-value.svelte";
	import DataTable from "$lib/components/data-table.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { useFormat } from "$lib/i18n/use-format";
	import { DEFAULT_PAGE_SIZE } from "$lib/pagination";
	import ChannelRowActions from "./channel-row-actions.svelte";

	/** One server-cut page of channels (`page` of `total`, from `?page=`). */
	let {
		channels,
		total,
		page,
		onEdit,
	}: {
		channels: Channel[];
		total: number;
		page: number;
		onEdit: (channel: Channel) => void;
	} = $props();

	const content = useIntlayer("channels");
	const format = useFormat();

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, Channel>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("name", {
				header: () => $content.columns.channel.value,
				cell: (ctx) => renderSnippet(nameCell, ctx.row.original),
			}),
			helper.accessor("kind", { header: () => $content.columns.kind.value }),
			helper.accessor("accessMode", {
				header: () => $content.columns.access.value,
				cell: (ctx) => $content.accessMode[ctx.getValue()].value,
			}),
			helper.accessor("allowedOrigins", {
				header: () => $content.columns.origins.value,
				cell: (ctx) => renderSnippet(origins, ctx.getValue()),
			}),
			helper.accessor("publishableKey", {
				header: () => $content.columns.publishableKey.value,
				cell: (ctx) => renderSnippet(publishableKey, ctx.getValue()),
			}),
			helper.accessor("createdAt", {
				header: () => $content.columns.created.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.display({
				id: "actions",
				cell: (ctx) =>
					renderComponent(ChannelRowActions, {
						channel: ctx.row.original,
						onEdit,
					}),
			}),
		]),
		get data() {
			return channels;
		},
	});
</script>

{#snippet nameCell(channel: Channel)}
	<div class="font-medium">{channel.name}</div>
	<div class="text-xs text-muted-foreground">{channel.slug}</div>
	{#if channel.disabledAt}<Badge variant="destructive">{$content.disabled.value}</Badge>{/if}
{/snippet}

{#snippet origins(list: string[])}
	{#if list.length}
		<div class="grid gap-0.5">
			{#each list as origin (origin)}<CopyValue value={origin} href={origin} />{/each}
		</div>
	{:else}—{/if}
{/snippet}

{#snippet publishableKey(key: string | null)}
	{#if key}<CopyValue value={key} />{:else}—{/if}
{/snippet}

<DataTable
	{table}
	emptyText={$content.empty.value}
	server={{ page, pageSize: DEFAULT_PAGE_SIZE, total, href: (target) => `/channels?page=${target}` }}
/>
