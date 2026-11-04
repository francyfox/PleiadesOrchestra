<script lang="ts">
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import {
		createColumnHelper,
		createTable,
		renderComponent,
		renderSnippet,
		rowSortingFeature,
		type SortingState,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { Customer } from "#lib/api-types.js";
	import DataTable from "#lib/components/data-table.svelte";
	import SortHeader from "#lib/components/sort-header.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Hint } from "#lib/components/ui/hint/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import type { ServerPagination } from "#lib/pagination.js";
	import { type UsersQuery, usersHref } from "#lib/users-query.js";
	import { goto } from "$app/navigation";
	import UserRowActions from "./user-row-actions.svelte";

	let {
		users,
		query,
		pagination,
	}: {
		users: Customer[];
		query: UsersQuery;
		pagination: ServerPagination;
	} = $props();

	const content = useIntlayer("users");
	const plans = useIntlayer("plans");
	const format = useFormat();

	const features = tableFeatures({ rowSortingFeature });
	const helper = createColumnHelper<typeof features, Customer>();
	type SortableHeader = {
		column: {
			getIsSorted: () => false | "asc" | "desc";
			getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
		};
	};
	// The server sorts (the table is paged there): a header click only changes the URL.
	const sortable = (label: () => string) => (ctx: SortableHeader) =>
		renderComponent(SortHeader, {
			label: label(),
			sorted: ctx.column.getIsSorted(),
			onToggle: ctx.column.getToggleSortingHandler(),
		});
	const sorting = (): SortingState => [
		{ id: query.sort ?? "createdAt", desc: query.order === "desc" },
	];
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("name", {
				header: sortable(() => $content.columns.name.value),
			}),
			helper.accessor("email", {
				header: sortable(() => $content.columns.email.value),
				cell: (ctx) => renderSnippet(emailCell, ctx.row.original),
			}),
			helper.accessor("createdAt", {
				header: sortable(() => $content.columns.created.value),
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.accessor("lastActiveAt", {
				header: sortable(() => $content.columns.lastActive.value),
				cell: (ctx) => {
					const at = ctx.getValue();
					return at === null ? $content.never.value : $format.date(at);
				},
			}),
			helper.accessor("channelsCount", {
				header: sortable(() => $content.columns.channels.value),
			}),
			helper.accessor("balanceUsd", {
				header: sortable(() => $content.columns.balance.value),
				cell: (ctx) => renderSnippet(balanceCell, ctx.getValue()),
			}),
			helper.accessor("plan", {
				id: "plan",
				header: sortable(() => $content.columns.plan.value),
				cell: (ctx) => renderSnippet(planCell, ctx.getValue()),
			}),
			helper.accessor((user) => user.plan?.currentPeriodEnd ?? null, {
				id: "paidUntil",
				header: sortable(() => $content.columns.paidUntil.value),
				cell: (ctx) => {
					const at = ctx.getValue();
					return at === null ? "—" : $format.date(at);
				},
			}),
			helper.accessor("banned", {
				header: sortable(() => $content.columns.status.value),
				cell: (ctx) => renderSnippet(status, ctx.getValue()),
			}),
			helper.display({
				id: "actions",
				enableSorting: false,
				cell: (ctx) =>
					renderComponent(UserRowActions, { user: ctx.row.original }),
			}),
		]),
		get data() {
			return users;
		},
		manualSorting: true,
		enableSortingRemoval: false,
		state: {
			get sorting() {
				return sorting();
			},
		},
		onSortingChange: (updater) => {
			const [next] =
				typeof updater === "function" ? updater(sorting()) : updater;
			if (!next) return;
			goto(
				usersHref(query, {
					sort: next.id as UsersQuery["sort"],
					order: next.desc ? "desc" : "asc",
				}),
				{ reset: false },
			);
		},
	});
</script>

{#snippet emailCell(user: Customer)}
	{user.email}
	{#if user.emailVerified}
		<CircleCheckIcon class="ml-1 inline size-4 align-text-bottom text-emerald-600 dark:text-emerald-400" role="img" aria-label={$content.verified.value} title={$content.verified.value} />
	{:else}
		<Badge variant="outline" class="ml-1">{$content.unverified.value}</Badge>
	{/if}
{/snippet}

{#snippet balanceCell(balance: number)}
	<Hint class={balance < 0 ? "tabular-nums text-destructive" : "tabular-nums"} text={$format.tr(balance)} hint={$format.trExact(balance)} />
{/snippet}

{#snippet planCell(plan: Customer["plan"])}
	{#if plan}
		<Badge variant={plan.status === "ended" || plan.status === "past_due" ? "destructive" : "outline"}>{$plans.status[plan.status].value}</Badge>
	{:else}
		<span class="text-muted-foreground">{$content.noPlan.value}</span>
	{/if}
{/snippet}

{#snippet status(banned: boolean)}
	{#if banned}
		<Badge variant="destructive">{$content.banned.value}</Badge>
	{:else}
		<Badge variant="outline">{$content.active.value}</Badge>
	{/if}
{/snippet}

<DataTable {table} server={pagination} emptyText={$content.empty.value} />
