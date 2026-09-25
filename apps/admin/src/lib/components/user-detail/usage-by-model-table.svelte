<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { UsageByModel } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import { useFormat } from "$lib/i18n/use-format";

	let { rows }: { rows: UsageByModel[] } = $props();

	const content = useIntlayer("user-detail");
	const common = useIntlayer("common");
	const format = useFormat();

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, UsageByModel>();
	const columns = helper.columns([
		helper.accessor("model", { header: () => $content.columns.model.value }),
		helper.accessor("kind", {
			header: () => $content.columns.kind.value,
			cell: (ctx) => $common.callKind[ctx.getValue()].value,
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
		helper.accessor("callsWithoutUsage", {
			header: () => $content.columns.withoutUsage.value,
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

<DataTable {table} />
