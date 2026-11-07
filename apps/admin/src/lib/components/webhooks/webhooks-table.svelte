<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderComponent,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { Webhook } from "#lib/api-types.js";
	import CopyValue from "#lib/components/copy-value.svelte";
	import DataTable from "#lib/components/data-table.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import WebhookEnabled from "./webhook-enabled.svelte";
	import WebhookRowActions from "./webhook-row-actions.svelte";

	let {
		items,
		events,
		eventLabel,
		onSecret,
	}: {
		items: Webhook[];
		/** The viewer's own events, for the edit dialog. */
		events: string[];
		eventLabel: (name: string) => string;
		onSecret: (secret: string) => void;
	} = $props();

	const content = useIntlayer("webhooks");
	const format = useFormat();

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, Webhook>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("name", {
				header: () => $content.columns.name.value,
				cell: (ctx) => renderSnippet(nameCell, ctx.row.original),
			}),
			helper.accessor("format", {
				header: () => $content.columns.type.value,
				cell: (ctx) => renderSnippet(typeCell, ctx.row.original),
			}),
			helper.accessor("url", {
				header: () => $content.columns.url.value,
				cell: (ctx) => renderSnippet(urlCell, ctx.row.original),
			}),
			helper.accessor("events", {
				header: () => $content.columns.events.value,
				cell: (ctx) => renderSnippet(eventsCell, ctx.row.original),
			}),
			helper.accessor("enabled", {
				header: () => $content.columns.enabled.value,
				cell: (ctx) =>
					renderComponent(WebhookEnabled, { item: ctx.row.original }),
			}),
			helper.display({
				id: "status",
				header: () => $content.columns.status.value,
				cell: (ctx) => renderSnippet(statusCell, ctx.row.original),
			}),
			helper.display({
				id: "actions",
				cell: (ctx) =>
					renderComponent(WebhookRowActions, {
						item: ctx.row.original,
						onSecret,
						events,
						eventLabel,
					}),
			}),
		]),
		get data() {
			return items;
		},
	});
</script>

{#snippet nameCell(item: Webhook)}
	<span class="font-medium">{item.name || "—"}</span>
{/snippet}

{#snippet typeCell(item: Webhook)}
	<Badge variant="outline">{$content.formats[item.format].value}</Badge>
{/snippet}

{#snippet urlCell(item: Webhook)}
	<CopyValue value={item.url} />
{/snippet}

{#snippet eventsCell(item: Webhook)}
	<div class="flex flex-wrap gap-1">
		{#each item.events as name (name)}<Badge variant="secondary">{eventLabel(name)}</Badge>{/each}
	</div>
{/snippet}

{#snippet statusCell(item: Webhook)}
	{#if item.lastAt === null}
		<span class="text-muted-foreground">{$content.never.value}</span>
	{:else}
		<span class="inline-flex items-center gap-2" title={item.lastError ?? ""}>
			<Badge variant={item.lastError ? "destructive" : "default"}>{item.lastStatus ?? "—"}</Badge>
			<span class="text-xs text-muted-foreground">{$format.date(item.lastAt)}</span>
		</span>
	{/if}
{/snippet}

<DataTable {table} emptyText={$content.empty.value} />
