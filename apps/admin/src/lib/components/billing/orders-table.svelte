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

	type Order = AccountBilling["orders"][number];

	let { orders }: { orders: Order[] } = $props();

	const content = useIntlayer("billing");
	const format = useFormat();

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, Order>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("createdAt", {
				header: () => $content.orders.date.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.accessor("kind", {
				header: () => $content.orders.kind.value,
				cell: (ctx) => $content.orders[ctx.getValue()].value,
			}),
			helper.accessor("amount", {
				header: () => $content.orders.amount.value,
				cell: (ctx) => $format.money(ctx.getValue(), ctx.row.original.currency),
			}),
			helper.accessor("status", { header: () => $content.orders.status.value }),
			helper.accessor("refundedAmount", {
				header: () => $content.orders.refunded.value,
				cell: (ctx) =>
					ctx.getValue() > 0
						? $format.money(ctx.getValue(), ctx.row.original.currency)
						: "—",
			}),
		]),
		get data() {
			return orders;
		},
	});
</script>

<DataTable {table} emptyText={$content.orders.empty.value} />
