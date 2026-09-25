<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { RunLlmCall } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import { useFormat } from "$lib/i18n/use-format";

	let { calls }: { calls: RunLlmCall[] } = $props();

	const content = useIntlayer("goap");
	const common = useIntlayer("common");
	const format = useFormat();

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, RunLlmCall>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("actionName", {
				header: () => $content.columns.action.value,
				cell: (ctx) => ctx.getValue() ?? "—",
			}),
			helper.accessor("kind", {
				header: () => $content.columns.kind.value,
				cell: (ctx) => $common.callKind[ctx.getValue()].value,
			}),
			helper.accessor("model", { header: () => $content.columns.model.value }),
			helper.accessor("inputTokens", {
				header: () => $content.columns.input.value,
				cell: (ctx) => $format.number(ctx.getValue(), $common.noData.value),
			}),
			helper.accessor("outputTokens", {
				header: () => $content.columns.output.value,
				cell: (ctx) => $format.number(ctx.getValue(), $common.noData.value),
			}),
			helper.accessor("latencyMs", {
				header: () => $content.columns.latency.value,
				cell: (ctx) => $format.ms(ctx.getValue()),
			}),
			helper.accessor("ok", {
				header: "OK",
				cell: (ctx) => (ctx.getValue() ? $common.yes.value : $common.no.value),
			}),
		]),
		get data() {
			return calls;
		},
	});
</script>

<section class="grid gap-2">
	<h2 class="font-medium">{$content.run.calls.value}</h2>
	<DataTable {table} emptyText={$content.run.noCalls.value} />
</section>
