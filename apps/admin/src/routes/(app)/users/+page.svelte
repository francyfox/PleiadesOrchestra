<script lang="ts">
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
	import { toast } from "svelte-sonner";
	import { enhance } from "$app/forms";
	import { goto } from "$app/navigation";
	import type { AdminUser, BulkAction } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import SortHeader from "$lib/components/sort-header.svelte";
	import StatusBadge from "$lib/components/status-badge.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { formatDate, formatNumber, totalTokens } from "$lib/format";
	import {
		nextPage,
		prevPage,
		sortingFromState,
		type UsersTableState,
		usersStateToSearch,
		withSorting,
	} from "$lib/users-table-state";

	let { data, form } = $props();

	const hrefFor = (state: UsersTableState) => {
		const search = usersStateToSearch(state).toString();
		return search ? `/users?${search}` : "/users";
	};

	const features = tableFeatures({ rowSortingFeature, rowSelectionFeature });
	const helper = createColumnHelper<typeof features, AdminUser>();

	const sortable =
		(label: string) =>
		(ctx: {
			column: {
				getIsSorted: () => false | "asc" | "desc";
				getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
			};
		}) =>
			renderComponent(SortHeader, {
				label,
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
				header: "Пользователь",
				enableSorting: false,
				cell: (ctx) => renderSnippet(nameCell, ctx.row.original),
			},
		),
		helper.accessor((user) => user.channel.name, {
			id: "channel",
			header: "Канал",
			enableSorting: false,
		}),
		helper.accessor("status", {
			header: "Статус",
			enableSorting: false,
			cell: (ctx) => renderComponent(StatusBadge, { status: ctx.getValue() }),
		}),
		helper.accessor("lastSeenAt", {
			header: sortable("Активность"),
			cell: (ctx) => formatDate(ctx.getValue()),
		}),
		helper.accessor("createdAt", {
			header: sortable("Создан"),
			cell: (ctx) => formatDate(ctx.getValue()),
		}),
		helper.accessor((user) => totalTokens(user.usage), {
			id: "tokens",
			header: sortable("Токены"),
			cell: (ctx) => formatNumber(ctx.getValue()),
		}),
		helper.display({
			id: "actions",
			cell: (ctx) => renderSnippet(rowActions, ctx.row.original),
		}),
	]);

	const [rowSelection, setRowSelection] = createTableState<RowSelectionState>(
		{},
	);

	const table = createTable({
		features,
		columns,
		get data() {
			return data.page.items;
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
			goto(hrefFor(withSorting(data.state, next)), {
				keepFocus: true,
				noScroll: true,
			});
		},
		onRowSelectionChange: setRowSelection,
	});

	const selectedIds = $derived(
		Object.keys(rowSelection()).filter((id) => rowSelection()[id]),
	);

	let bulkReason = $state("");

	const bulkLabels: Record<BulkAction, string> = {
		whitelist: "В белый список",
		unwhitelist: "Убрать из белого списка",
		block: "Заблокировать",
		unblock: "Разблокировать",
	};

	const submitted = () => {
		return async ({
			result,
			update,
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === "success") {
				toast.success(`Обновлено: ${result.data?.updated ?? 0}`);
				setRowSelection({});
				bulkReason = "";
			} else if (result.type === "failure") {
				toast.error(String(result.data?.message ?? "Ошибка"));
			}
			await update();
		};
	};

	const selectClass =
		"h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";
</script>

{#snippet selectAll(t: typeof table)}
	<Checkbox
		aria-label="Выбрать все"
		checked={t.getIsAllPageRowsSelected()}
		indeterminate={t.getIsSomePageRowsSelected() && !t.getIsAllPageRowsSelected()}
		onCheckedChange={(value) => t.toggleAllPageRowsSelected(!!value)}
	/>
{/snippet}

{#snippet selectRow(row: { getIsSelected: () => boolean; toggleSelected: (value?: boolean) => void })}
	<Checkbox
		aria-label="Выбрать"
		checked={row.getIsSelected()}
		onCheckedChange={(value) => row.toggleSelected(!!value)}
	/>
{/snippet}

{#snippet nameCell(user: AdminUser)}
	<a class="font-medium underline-offset-4 hover:underline" href={`/users/${encodeURIComponent(user.id)}`}>
		{user.displayName ?? user.externalUserId ?? "аноним"}
	</a>
	{#if user.kind === "anonymous"}<Badge variant="outline" class="ml-1">anon</Badge>{/if}
	{#if user.displayName && user.externalUserId}
		<div class="text-xs text-muted-foreground">{user.externalUserId}</div>
	{/if}
{/snippet}

{#snippet rowActions(user: AdminUser)}
	<form method="POST" action="?/bulk" use:enhance={submitted} class="flex justify-end gap-1">
		<input type="hidden" name="ids" value={user.id} />
		{#if user.status === "pending"}
			<Button size="sm" variant="outline" type="submit" name="action" value="whitelist">В белый список</Button>
		{/if}
		{#if user.status === "blocked"}
			<Button size="sm" variant="outline" type="submit" name="action" value="unblock">Разблокировать</Button>
		{:else}
			<Button size="sm" variant="ghost" type="submit" name="action" value="block">Заблокировать</Button>
		{/if}
	</form>
{/snippet}

<h1 class="text-2xl font-semibold">Пользователи</h1>

<form method="GET" class="flex flex-wrap items-end gap-2">
	<Input name="q" placeholder="Имя или внешний id" value={data.state.q ?? ""} class="w-56" />
	<select name="channel" class={selectClass} value={data.state.channel ?? ""}>
		<option value="">Все каналы</option>
		{#each data.channels as channel (channel.id)}
			<option value={channel.slug}>{channel.name}</option>
		{/each}
	</select>
	<select name="status" class={selectClass} value={data.state.status ?? ""}>
		<option value="">Любой статус</option>
		<option value="allowed">Допущен</option>
		<option value="pending">Ждёт белого списка</option>
		<option value="blocked">Заблокирован</option>
	</select>
	<select name="kind" class={selectClass} value={data.state.kind ?? ""}>
		<option value="">Все</option>
		<option value="identified">Идентифицированные</option>
		<option value="anonymous">Анонимные</option>
	</select>
	<input type="hidden" name="sort" value={data.state.sort} />
	<input type="hidden" name="order" value={data.state.order} />
	<input type="hidden" name="limit" value={data.state.limit} />
	<Button type="submit" variant="secondary">Применить</Button>
	<Button href="/users" variant="ghost">Сбросить</Button>
</form>

{#if selectedIds.length > 0}
	<form
		method="POST"
		action="?/bulk"
		use:enhance={submitted}
		class="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2"
	>
		<span class="text-sm">Выбрано: {selectedIds.length}</span>
		{#each selectedIds as id (id)}<input type="hidden" name="ids" value={id} />{/each}
		<Input name="reason" placeholder="Причина блокировки (необязательно)" bind:value={bulkReason} class="w-64" />
		{#each Object.entries(bulkLabels) as [action, label] (action)}
			<Button size="sm" type="submit" name="action" value={action} variant={action === "block" ? "destructive" : "outline"}>
				{label}
			</Button>
		{/each}
	</form>
{/if}

{#if form?.message}<p class="text-sm text-destructive">{form.message}</p>{/if}

<DataTable {table} emptyText="Пользователей не найдено" />

<div class="flex items-center justify-between text-sm text-muted-foreground">
	<span>Всего: {formatNumber(data.page.total)}</span>
	<div class="flex gap-2">
		<Button size="sm" variant="outline" href={hrefFor(prevPage(data.state))} disabled={data.state.trail.length === 0}>
			Назад
		</Button>
		<Button
			size="sm"
			variant="outline"
			href={data.page.nextCursor ? hrefFor(nextPage(data.state, data.page.nextCursor)) : undefined}
			disabled={!data.page.nextCursor}
		>
			Дальше
		</Button>
	</div>
</div>
