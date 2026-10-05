<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { IntentExample } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { useFormat } from "$lib/i18n/use-format";
	import type { ServerPagination } from "$lib/pagination";
	import IntentActions from "./intent-actions.svelte";

	/** One server-cut page of learned examples, with the verdict actions on each row. */
	let {
		items,
		pagination,
		filtered = false,
	}: {
		items: IntentExample[];
		pagination: ServerPagination;
		/** A filter is on: an empty page means "nothing matches", not "nothing yet". */
		filtered?: boolean;
	} = $props();

	const content = useIntlayer("intents");
	const format = useFormat();

	const variant = {
		pending: "secondary",
		approved: "outline",
		rejected: "destructive",
	} as const;

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, IntentExample>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("sample", {
				header: () => $content.columns.text.value,
			}),
			helper.accessor("intent", {
				header: () => $content.columns.intent.value,
				cell: (ctx) => renderSnippet(intentCell, ctx.getValue()),
			}),
			helper.accessor("channelName", {
				header: () => $content.columns.channel.value,
			}),
			helper.accessor("status", {
				header: () => $content.columns.status.value,
				cell: (ctx) => renderSnippet(statusCell, ctx.getValue()),
			}),
			helper.accessor("source", {
				header: () => $content.columns.source.value,
				cell: (ctx) => $content.source[ctx.getValue()].value,
			}),
			helper.accessor("seenCount", {
				header: () => $content.columns.seen.value,
			}),
			helper.accessor("updatedAt", {
				header: () => $content.columns.updated.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.display({
				id: "actions",
				header: () => "",
				cell: (ctx) => renderSnippet(actionsCell, ctx.row.original),
			}),
		]),
		get data() {
			return items;
		},
	});
</script>

{#snippet intentCell(intent: string)}
	<Badge variant="outline" class="font-mono text-xs">{intent}</Badge>
{/snippet}

{#snippet statusCell(status: IntentExample["status"])}
	<Badge variant={variant[status]}>{$content.status[status].value}</Badge>
{/snippet}

{#snippet actionsCell(item: IntentExample)}
	<IntentActions {item} />
{/snippet}

<DataTable
	{table}
	emptyText={filtered ? $content.noMatch.value : $content.empty.value}
	server={pagination}
/>
