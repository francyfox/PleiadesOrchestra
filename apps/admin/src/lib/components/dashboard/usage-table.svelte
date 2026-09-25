<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { UsageRow } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import { useFormat } from "$lib/i18n/use-format";

	/** Usage rows grouped by user or channel; user rows link to the user card. */
	let { rows, groupBy }: { rows: UsageRow[]; groupBy: "user" | "channel" } =
		$props();

	const content = useIntlayer("dashboard");
	const format = useFormat();

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, UsageRow>();
	// Headers are functions so they follow the current locale.
	const columns = helper.columns([
		helper.accessor("label", {
			header: () => $content.columns[groupBy].value,
			cell: (ctx) => renderSnippet(labelCell, ctx.row.original),
		}),
		helper.accessor("inputTokens", {
			header: () => $content.columns.input.value,
			cell: (ctx) => $format.number(ctx.getValue()),
		}),
		helper.accessor("outputTokens", {
			header: () => $content.columns.output.value,
			cell: (ctx) => $format.number(ctx.getValue()),
		}),
		helper.accessor("calls", {
			header: () => $content.columns.calls.value,
			cell: (ctx) => $format.number(ctx.getValue()),
		}),
		helper.accessor("avgLatencyMs", {
			header: () => $content.columns.avgLatency.value,
			cell: (ctx) => $format.ms(ctx.getValue()),
		}),
	]);

	const table = createTable({
		features,
		columns,
		get data() {
			return rows;
		},
	});
</script>

{#snippet labelCell(row: UsageRow)}
	{#if groupBy === "user" && row.key && row.label !== row.key}
		<a class="underline-offset-4 hover:underline" href={`/users/${encodeURIComponent(row.key)}`}>{row.label}</a>
	{:else}
		{row.label}
	{/if}
{/snippet}

<DataTable {table} />
