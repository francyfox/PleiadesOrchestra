<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { PerformanceReport } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import { useFormat } from "$lib/i18n/use-format";

	type Row = PerformanceReport["rows"][number];
	/** Per-day percentiles of one call kind, newest first. */
	let { rows }: { rows: Row[] } = $props();

	const content = useIntlayer("performance");
	const format = useFormat();

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, Row>();
	const ms = (key: "p50" | "p90" | "p99" | "max") =>
		helper.accessor(key, {
			header: key,
			cell: (c) => $format.ms(c.getValue()),
		});
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("day", { header: () => $content.columns.day.value }),
			helper.accessor("calls", {
				header: () => $content.columns.calls.value,
				cell: (c) => $format.number(c.getValue()),
			}),
			helper.accessor("failed", {
				header: () => $content.columns.failed.value,
				cell: (c) => $format.number(c.getValue()),
			}),
			ms("p50"),
			ms("p90"),
			ms("p99"),
			ms("max"),
			helper.accessor("tokensPerSecond", {
				header: () => $content.columns.tokensPerSecond.value,
				cell: (c) => c.getValue() ?? "—",
			}),
		]),
		get data() {
			return [...rows].reverse();
		},
	});
</script>

<DataTable {table} emptyText={$content.empty.value} />
