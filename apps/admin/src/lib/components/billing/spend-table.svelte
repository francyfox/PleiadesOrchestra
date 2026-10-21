<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { AccountBilling } from "#lib/api-types.js";
	import DataTable from "#lib/components/data-table.svelte";
	import { useFormat } from "#lib/i18n/use-format.js";

	type Month = AccountBilling["spend"][number];

	let { spend }: { spend: Month[] } = $props();

	const content = useIntlayer("billing");
	const format = useFormat();

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, Month>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("month", { header: () => $content.spend.month.value }),
			helper.accessor("tokens", {
				header: () => $content.spend.tokens.value,
				cell: (ctx) => $format.number(ctx.getValue()),
			}),
			helper.accessor("costUsd", {
				header: () => $content.spend.cost.value,
				cell: (ctx) => $format.usd(ctx.getValue()),
			}),
		]),
		get data() {
			return spend;
		},
	});
</script>

<DataTable {table} emptyText={$content.spend.empty.value} />
