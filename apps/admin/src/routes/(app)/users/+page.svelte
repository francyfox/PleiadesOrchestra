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
	import { goto } from "$app/navigation";
	import type { AdminUser } from "$lib/api-types";
	import CopyValue from "$lib/components/copy-value.svelte";
	import DataTable from "$lib/components/data-table.svelte";
	import SortHeader from "$lib/components/sort-header.svelte";
	import StatusBadge from "$lib/components/status-badge.svelte";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import BulkActionsBar from "$lib/components/users/bulk-actions-bar.svelte";
	import UserNameCell from "$lib/components/users/user-name-cell.svelte";
	import UserRowActions from "$lib/components/users/user-row-actions.svelte";
	import UsersFilters from "$lib/components/users/users-filters.svelte";
	import UsersPagination from "$lib/components/users/users-pagination.svelte";
	import { useFormat } from "$lib/i18n/use-format";
	import { whoisUrl } from "$lib/ip";
	import { useLiveQuery } from "$lib/live/use-live-query.svelte";
	import { prefetched } from "$lib/query/prefetch";
	import { queries } from "$lib/query/queries";
	import {
		sortingFromState,
		toUsersQuery,
		usersStateToSearch,
		withSorting,
	} from "$lib/users-table-state";

	let { data } = $props();

	const live = useLiveQuery("users", () => toUsersQuery(data.state));
	const channelList = createQuery(() => queries.allChannels());
	const channels = $derived(prefetched(channelList).items);

	const content = useIntlayer("users");
	const actions = useIntlayer("user-actions");
	const format = useFormat();

	const features = tableFeatures({ rowSortingFeature, rowSelectionFeature });
	const helper = createColumnHelper<typeof features, AdminUser>();

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
			(user) => user.displayName ?? user.externalUserId ?? user.id,
			{
				id: "name",
				header: () => $content.columns.user.value,
				enableSorting: false,
				cell: (ctx) =>
					renderComponent(UserNameCell, { user: ctx.row.original }),
			},
		),
		helper.accessor((user) => user.channel.name, {
			id: "channel",
			header: () => $content.columns.channel.value,
			enableSorting: false,
		}),
		helper.accessor((user) => user.ip ?? "", {
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
			(user) => user.usage.inputTokens + user.usage.outputTokens,
			{
				id: "tokens",
				header: sortable(() => $content.columns.tokens.value),
				cell: (ctx) => $format.number(ctx.getValue()),
			},
		),
		helper.display({
			id: "actions",
			cell: (ctx) =>
				renderComponent(UserRowActions, { user: ctx.row.original }),
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
		getRowId: (user) => user.id,
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
			const search = usersStateToSearch(
				withSorting(data.state, next),
			).toString();
			goto(search ? `/users?${search}` : "/users", {
				keepFocus: true,
				noScroll: true,
			});
		},
		onRowSelectionChange: setRowSelection,
	});

	// A live refresh can drop rows (filtered out, deleted, another page): forget their selection.
	$effect(() => {
		const present = new Set(live.current.items.map((user) => user.id));
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

{#snippet ipCell(user: AdminUser)}
	{#if user.ip}
		<CopyValue value={user.ip} href={whoisUrl(user.ip)} label={$actions.copyIp.value} />
	{:else}
		<span class="text-muted-foreground">—</span>
	{/if}
{/snippet}

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>

<UsersFilters state={data.state} {channels} />

{#if selectedIds.length > 0}
	<BulkActionsBar ids={selectedIds} onDone={() => setRowSelection({})} />
{/if}

<DataTable {table} emptyText={$content.empty.value} pageSize={data.state.limit} />

<UsersPagination state={data.state} page={live.current} />
