<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import {
		createColumnHelper,
		createTable,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { GoapActionInfo } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import FlowGraph from "$lib/components/goap/flow-graph.svelte";
	import * as Card from "$lib/components/ui/card/index.js";
	import { catalogToGraph, formatGoal } from "$lib/goap-graph";
	import { prefetched } from "$lib/query/prefetch";
	import { queries } from "$lib/query/queries";

	const catalog = createQuery(() => queries.goapActions());
	const actions = $derived(prefetched(catalog).actions);

	const content = useIntlayer("goap");
	const graph = $derived(catalogToGraph(actions));

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, GoapActionInfo>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("name", { header: () => $content.columns.action.value }),
			helper.accessor("cost", { header: "Cost" }),
			helper.accessor("preconditions", {
				header: () => $content.columns.preconditions.value,
				cell: (ctx) =>
					Object.keys(ctx.getValue()).length ? formatGoal(ctx.getValue()) : "—",
			}),
			helper.accessor("effects", {
				header: () => $content.columns.effects.value,
				cell: (ctx) => formatGoal(ctx.getValue()),
			}),
		]),
		get data() {
			return actions;
		},
	});
</script>

<h1 class="text-2xl font-semibold">{$content.catalog.title.value}</h1>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.catalog.graph.value}</Card.Title>
		<Card.Description>{$content.catalog.graphHint.value}</Card.Description>
	</Card.Header>
	<Card.Content>
		<FlowGraph
			{graph}
			details={(node) => (typeof node.cost === "number" ? [String($content.cost({ cost: node.cost }))] : [])}
		/>
	</Card.Content>
</Card.Root>

<DataTable {table} emptyText={$content.catalog.empty.value} />
