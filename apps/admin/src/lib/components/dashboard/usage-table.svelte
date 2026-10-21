<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { UsageRow } from "#lib/api-types.js";
	import DataTable from "#lib/components/data-table.svelte";
	import { useFormat } from "#lib/i18n/use-format.js";

	/** Usage rows grouped by visitor, channel or model; visitor rows link to the visitor card, model rows show the price. */
	let {
		rows,
		groupBy,
	}: {
		rows: UsageRow[];
		groupBy: "visitor" | "channel" | "model";
	} = $props();

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
		helper.accessor("costUsd", {
			header: () => $content.columns.spend.value,
			cell: (ctx) => $format.usd(ctx.getValue()),
		}),
		// groupBy is fixed for the table's lifetime, so the column set is decided once.
		// svelte-ignore state_referenced_locally
		...(groupBy === "model"
			? [
					helper.display({
						id: "price",
						header: () => $content.columns.price.value,
						cell: (ctx) => {
							const price = ctx.row.original.price;
							return price
								? `${$format.usd(price.inputPerMillion)} / ${$format.usd(price.outputPerMillion)}`
								: "—";
						},
					}),
				]
			: []),
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
	{#if groupBy === "visitor" && row.key && row.label !== row.key}
		<a class="underline-offset-4 hover:underline" href={`/visitors/${encodeURIComponent(row.key)}`}>{row.label}</a>
	{:else}
		{row.label}
	{/if}
{/snippet}

<DataTable {table} />
