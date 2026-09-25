<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { TraceEvent } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import { formatValue } from "$lib/format";
	import { type EffectRow, effectsRows } from "$lib/goap-graph";

	/** Expected vs observed effects per executed action; mismatches highlighted. */
	let { events }: { events: TraceEvent[] } = $props();

	const content = useIntlayer("goap");
	const rows = $derived(effectsRows(events));

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, EffectRow>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("attempt", {
				header: () => $content.columns.attempt.value,
			}),
			helper.accessor("action", {
				header: () => $content.columns.action.value,
			}),
			helper.accessor("key", { header: () => $content.columns.fact.value }),
			helper.accessor("expected", {
				header: () => $content.columns.expected.value,
				cell: (ctx) => formatValue(ctx.getValue()),
			}),
			helper.accessor("observed", {
				header: () => $content.columns.observed.value,
				cell: (ctx) => formatValue(ctx.getValue()),
			}),
			helper.accessor("match", {
				header: "",
				cell: (ctx) => $content.match[ctx.getValue()].value,
			}),
		]),
		get data() {
			return rows;
		},
	});
</script>

<section class="grid gap-2">
	<h2 class="font-medium">{$content.run.effects.value}</h2>
	<DataTable
		{table}
		emptyText={$content.run.noEffects.value}
		rowClass={(row) => (row.match === "mismatch" ? "bg-red-500/10" : row.match === "extra" ? "text-muted-foreground" : "")}
	/>
</section>
