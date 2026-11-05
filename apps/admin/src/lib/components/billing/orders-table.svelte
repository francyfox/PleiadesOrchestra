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
	import { orderCredit } from "#lib/order-credit.js";

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
			helper.display({
				id: "credited",
				header: () => $content.orders.credited.value,
				cell: (ctx) => {
					const credit = orderCredit(ctx.row.original);
					return credit ? $format.tr(credit.creditedTr) : "—";
				},
			}),
			helper.display({
				id: "heldBack",
				header: () => $content.orders.heldBack.value,
				cell: (ctx) => {
					const held = orderCredit(ctx.row.original)?.heldBackUsd;
					return held == null ? "—" : $format.money(held * 100, "usd");
				},
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
