<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import {
		createColumnHelper,
		createTable,
		createTableState,
		type RowSelectionState,
		renderComponent,
		renderSnippet,
		rowSelectionFeature,
		rowSortingFeature,
		type SortingState,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { Visitor } from "#lib/api-types.js";
	import CopyValue from "#lib/components/copy-value.svelte";
	import DataTable from "#lib/components/data-table.svelte";
	import SortHeader from "#lib/components/sort-header.svelte";
	import StatusBadge from "#lib/components/status-badge.svelte";
	import { Checkbox } from "#lib/components/ui/checkbox/index.js";
	import BulkActionsBar from "#lib/components/visitors/bulk-actions-bar.svelte";
	import VisitorNameCell from "#lib/components/visitors/visitor-name-cell.svelte";
	import VisitorRowActions from "#lib/components/visitors/visitor-row-actions.svelte";
	import VisitorsFilters from "#lib/components/visitors/visitors-filters.svelte";
	import VisitorsPagination from "#lib/components/visitors/visitors-pagination.svelte";
	import { useFormat } from "#lib/i18n/use-format.js";
	import { whoisUrl } from "#lib/ip.js";
	import { useLiveQuery } from "#lib/live/use-live-query.svelte.js";
	import { prefetched } from "#lib/query/prefetch.js";
	import { queries } from "#lib/query/queries.js";
	import {
		sortingFromState,
		toVisitorsQuery,
		visitorsStateToSearch,
		withSorting,
	} from "#lib/visitors-table-state.js";
	import { goto } from "$app/navigation";

	let { data } = $props();

	const live = useLiveQuery("visitors", () => toVisitorsQuery(data.state));
	const channelList = createQuery(() => queries.allChannels());
	const channels = $derived(prefetched(channelList).items);

	const content = useIntlayer("visitors");
	const actions = useIntlayer("visitor-actions");
	const format = useFormat();

	const features = tableFeatures({ rowSortingFeature, rowSelectionFeature });
	const helper = createColumnHelper<typeof features, Visitor>();

	type SortableHeader = {
		column: {
			getIsSorted: () => false | "asc" | "desc";
			getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
		};
	};
	// Headers are functions of the current dictionary, so they follow a locale switch.
	const sortable = (label: () => string) => (ctx: SortableHeader) =>
		renderComponent(SortHeader, {
			label: label(),
			sorted: ctx.column.getIsSorted(),
			onToggle: ctx.column.getToggleSortingHandler(),
		});

	const columns = helper.columns([
		helper.display({
			id: "select",
			header: (ctx) => renderSnippet(selectAll, ctx.table),
			cell: (ctx) => renderSnippet(selectRow, ctx.row),
		}),
		helper.accessor(
			(visitor) => visitor.displayName ?? visitor.externalUserId ?? visitor.id,
			{
				id: "name",
				header: () => $content.columns.visitor.value,
				enableSorting: false,
				cell: (ctx) =>
					renderComponent(VisitorNameCell, { visitor: ctx.row.original }),
			},
		),
		helper.accessor((visitor) => visitor.channel.name, {
			id: "channel",
			header: () => $content.columns.channel.value,
			enableSorting: false,
		}),
		helper.accessor((visitor) => visitor.ip ?? "", {
			id: "ip",
			header: () => $content.columns.ip.value,
			enableSorting: false,
			cell: (ctx) => renderSnippet(ipCell, ctx.row.original),
		}),
		helper.accessor("status", {
			header: () => $content.columns.status.value,
			enableSorting: false,
			cell: (ctx) => renderComponent(StatusBadge, { status: ctx.getValue() }),
		}),
		helper.accessor("lastSeenAt", {
			header: sortable(() => $content.columns.lastSeen.value),
			cell: (ctx) => $format.date(ctx.getValue()),
		}),
		helper.accessor("createdAt", {
			header: sortable(() => $content.columns.created.value),
			cell: (ctx) => $format.date(ctx.getValue()),
		}),
		helper.accessor(
			(visitor) => visitor.usage.inputTokens + visitor.usage.outputTokens,
			{
				id: "tokens",
				header: sortable(() => $content.columns.tokens.value),
				cell: (ctx) => $format.number(ctx.getValue()),
			},
		),
		helper.display({
			id: "actions",
			cell: (ctx) =>
				renderComponent(VisitorRowActions, { visitor: ctx.row.original }),
		}),
	]);

	const [rowSelection, setRowSelection] = createTableState<RowSelectionState>(
		{},
	);

	const table = createTable({
		features,
		columns,
		get data() {
			return live.current.items;
		},
		getRowId: (visitor) => visitor.id,
		manualSorting: true,
		enableSortingRemoval: false,
		state: {
			get sorting() {
				return sortingFromState(data.state) as SortingState;
			},
			get rowSelection() {
				return rowSelection();
			},
		},
		onSortingChange: (updater) => {
			const current = sortingFromState(data.state) as SortingState;
			const next = typeof updater === "function" ? updater(current) : updater;
			const search = visitorsStateToSearch(
				withSorting(data.state, next),
			).toString();
			goto(search ? `/visitors?${search}` : "/visitors", {
				reset: false,
			});
		},
		onRowSelectionChange: setRowSelection,
	});

	// A live refresh can drop rows (filtered out, deleted, another page): forget their selection.
	$effect(() => {
		const present = new Set(live.current.items.map((visitor) => visitor.id));
		const selected = rowSelection();
		const kept = Object.fromEntries(
			Object.entries(selected).filter(([id]) => present.has(id)),
		);
		if (Object.keys(kept).length !== Object.keys(selected).length) {
			setRowSelection(kept);
		}
	});

	const selectedIds = $derived(
		Object.keys(rowSelection()).filter((id) => rowSelection()[id]),
	);
</script>

{#snippet selectAll(t: typeof table)}
	<Checkbox
		aria-label={$content.selectAll.value}
		checked={t.getIsAllPageRowsSelected()}
		indeterminate={t.getIsSomePageRowsSelected() && !t.getIsAllPageRowsSelected()}
		onCheckedChange={(value) => t.toggleAllPageRowsSelected(!!value)}
	/>
{/snippet}

{#snippet selectRow(row: { getIsSelected: () => boolean; toggleSelected: (value?: boolean) => void })}
	<Checkbox
		aria-label={$content.selectRow.value}
		checked={row.getIsSelected()}
		onCheckedChange={(value) => row.toggleSelected(!!value)}
	/>
{/snippet}

{#snippet ipCell(visitor: Visitor)}
	{#if visitor.ip}
		<CopyValue value={visitor.ip} href={whoisUrl(visitor.ip)} label={$actions.copyIp.value} />
	{:else}
		<span class="text-muted-foreground">—</span>
	{/if}
{/snippet}

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>

<VisitorsFilters state={data.state} {channels} />

{#if selectedIds.length > 0}
	<BulkActionsBar ids={selectedIds} onDone={() => setRowSelection({})} />
{/if}

<DataTable {table} emptyText={$content.empty.value} pageSize={data.state.limit} />

<VisitorsPagination state={data.state} page={live.current} />
