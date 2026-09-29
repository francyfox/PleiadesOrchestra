<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import {
		createColumnHelper,
		createTable,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { DynamicActionInfo, GoapActionInfo } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import FlowGraph from "$lib/components/goap/flow-graph.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { catalogToGraph, formatGoal } from "$lib/goap-graph";
	import { useFormat } from "$lib/i18n/use-format";
	import { prefetched } from "$lib/query/prefetch";
	import { queries } from "$lib/query/queries";

	const catalog = createQuery(() => queries.goapActions());
	const actions = $derived(prefetched(catalog).actions);

	const content = useIntlayer("goap");
	const format = useFormat();
	const graph = $derived(catalogToGraph(actions));

	// Dynamic actions (e.g. a WebMCP tool catalog) never had a live listing —
	// they only ever existed inside one visitor's request. Reconstructed from
	// a specific user's own run history instead, so this needs an id typed
	// in, not something `+page.ts` can prefetch ahead of time.
	let userIdInput = $state("");
	let dynamicUserId = $state<string | undefined>(undefined);
	const dynamicQuery = createQuery(() => ({
		...queries.goapActions(dynamicUserId),
		enabled: dynamicUserId !== undefined,
	}));
	const dynamicActions = $derived(dynamicQuery.data?.dynamicActions ?? []);

	const dynamicFeatures = tableFeatures({});
	const dynamicHelper = createColumnHelper<
		typeof dynamicFeatures,
		DynamicActionInfo
	>();
	const dynamicTable = createTable({
		features: dynamicFeatures,
		columns: dynamicHelper.columns([
			dynamicHelper.accessor("name", {
				header: () => $content.columns.action.value,
			}),
			dynamicHelper.accessor("cost", {
				header: "Cost",
				cell: (ctx) => $format.number(ctx.getValue()),
			}),
			dynamicHelper.accessor("effects", {
				header: () => $content.columns.effects.value,
				cell: (ctx) => formatGoal(ctx.getValue()),
			}),
			dynamicHelper.accessor("lastSeenAt", {
				header: () => $content.catalog.dynamic.lastSeen.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
		]),
		get data() {
			return dynamicActions;
		},
	});

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

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.catalog.dynamic.title.value}</Card.Title>
		<Card.Description>{$content.catalog.dynamic.hint.value}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<form
			class="flex flex-wrap items-end gap-2"
			onsubmit={(event) => {
				event.preventDefault();
				dynamicUserId = userIdInput.trim() || undefined;
			}}
		>
			<div class="flex flex-col gap-1.5">
				<Label for="dynamic-user-id">
					{$content.catalog.dynamic.userIdLabel.value}
				</Label>
				<Input
					id="dynamic-user-id"
					name="userId"
					placeholder={$content.catalog.dynamic.userIdPlaceholder.value}
					bind:value={userIdInput}
					class="w-72"
				/>
			</div>
			<Button type="submit">{$content.catalog.dynamic.load.value}</Button>
		</form>

		{#if dynamicUserId !== undefined}
			<DataTable
				table={dynamicTable}
				emptyText={$content.catalog.dynamic.empty.value}
			/>
		{/if}
	</Card.Content>
</Card.Root>
