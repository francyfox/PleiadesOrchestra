<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import type { GoapActionInfo } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import FlowGraph from "$lib/components/flow-graph.svelte";
	import * as Card from "$lib/components/ui/card/index.js";
	import { catalogToGraph, formatGoal } from "$lib/goap-graph";

	let { data } = $props();

	const graph = $derived(catalogToGraph(data.actions));

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, GoapActionInfo>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("name", { header: "Действие" }),
			helper.accessor("cost", { header: "Cost" }),
			helper.accessor("preconditions", {
				header: "Предусловия",
				cell: (ctx) =>
					Object.keys(ctx.getValue()).length ? formatGoal(ctx.getValue()) : "—",
			}),
			helper.accessor("effects", {
				header: "Эффекты",
				cell: (ctx) => formatGoal(ctx.getValue()),
			}),
		]),
		get data() {
			return data.actions;
		},
	});
</script>

<h1 class="text-2xl font-semibold">Каталог GOAP-действий</h1>

<Card.Root>
	<Card.Header>
		<Card.Title>Граф «факт → действие → факт»</Card.Title>
		<Card.Description>Колонки — глубина зависимостей; видно, какие цели вообще достижимы.</Card.Description>
	</Card.Header>
	<Card.Content>
		<FlowGraph
			{graph}
			details={(node) => (typeof node.cost === "number" ? [`cost ${node.cost}`] : [])}
		/>
	</Card.Content>
</Card.Root>

<DataTable {table} emptyText="Каталог пуст" />
