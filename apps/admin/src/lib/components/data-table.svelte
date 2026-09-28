<script lang="ts" generics="TFeatures extends TableFeatures, TData extends RowData">
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import {
		FlexRender,
		type RowData,
		type Table,
		type TableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as UiTable from "$lib/components/ui/table/index.js";
	import { useFormat } from "$lib/i18n/use-format";
	import {
		clampPage,
		DEFAULT_PAGE_SIZE,
		pageCount,
		pageSlice,
		type ServerPagination,
	} from "$lib/pagination";

	/**
	 * The one table of the admin: headless TanStack model rendered with
	 * shadcn markup. Long content scrolls sideways or is cut with an ellipsis,
	 * and rows are paged — client-side by default (`pageSize` rows at a time),
	 * or as the server's own pages when `server` is given (DB-backed lists).
	 */
	let {
		table,
		emptyText,
		rowClass,
		pageSize = DEFAULT_PAGE_SIZE,
		server,
		wrap = false,
	}: {
		table: Table<TFeatures, TData>;
		/** Defaults to the common "No data". */
		emptyText?: string;
		rowClass?: (row: TData) => string;
		pageSize?: number;
		server?: ServerPagination;
		/** Let long cells wrap onto several lines instead of being cut with an ellipsis (reference tables). */
		wrap?: boolean;
	} = $props();

	const common = useIntlayer("common");
	const format = useFormat();

	let requestedPage = $state(1);

	const allRows = $derived(table.getRowModel().rows);
	const total = $derived(server ? server.total : allRows.length);
	const size = $derived(server ? server.pageSize : pageSize);
	const pages = $derived(pageCount(total, size));
	const page = $derived(clampPage(server ? server.page : requestedPage, pages));
	const rows = $derived(server ? allRows : pageSlice(allRows, page, size));
	const paged = $derived(total > size);

	const labels = $derived($common.pagination);
</script>

<div class="overflow-hidden rounded-md border">
	<UiTable.Root>
		<UiTable.Header>
			{#each table.getHeaderGroups() as group (group.id)}
				<UiTable.Row>
					{#each group.headers as header (header.id)}
						<UiTable.Head colspan={header.colSpan}>
							{#if !header.isPlaceholder}<FlexRender {header} />{/if}
						</UiTable.Head>
					{/each}
				</UiTable.Row>
			{/each}
		</UiTable.Header>
		<UiTable.Body>
			{#each rows as row (row.id)}
				<UiTable.Row class={rowClass?.(row.original)}>
					{#each row.getAllCells() as cell (cell.id)}
						<UiTable.Cell class={wrap ? "align-top whitespace-normal" : "max-w-lg truncate"}><FlexRender {cell} /></UiTable.Cell>
					{/each}
				</UiTable.Row>
			{:else}
				<UiTable.Row>
					<UiTable.Cell
						colspan={table.getAllLeafColumns().length}
						class="h-24 text-center text-muted-foreground"
					>
						{emptyText ?? $common.emptyTable.value}
					</UiTable.Cell>
				</UiTable.Row>
			{/each}
		</UiTable.Body>
	</UiTable.Root>
</div>

{#if paged}
	<div class="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
		<span>{labels.total({ count: $format.number(total) })}</span>
		<div class="flex items-center gap-2">
			<span class="tabular-nums">{labels.page({ page, pages })}</span>
			{#if server}
				<Button size="sm" variant="outline" href={page > 1 ? server.href(page - 1) : undefined} disabled={page <= 1} aria-label={labels.prev.value}>
					<ChevronLeftIcon />
				</Button>
				<Button size="sm" variant="outline" href={page < pages ? server.href(page + 1) : undefined} disabled={page >= pages} aria-label={labels.next.value}>
					<ChevronRightIcon />
				</Button>
			{:else}
				<Button size="sm" variant="outline" disabled={page <= 1} aria-label={labels.prev.value} onclick={() => (requestedPage = page - 1)}>
					<ChevronLeftIcon />
				</Button>
				<Button size="sm" variant="outline" disabled={page >= pages} aria-label={labels.next.value} onclick={() => (requestedPage = page + 1)}>
					<ChevronRightIcon />
				</Button>
			{/if}
		</div>
	</div>
{/if}
