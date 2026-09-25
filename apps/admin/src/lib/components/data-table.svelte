<script lang="ts" generics="TFeatures extends TableFeatures, TData extends RowData">
	import {
		FlexRender,
		type RowData,
		type Table,
		type TableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import * as UiTable from "$lib/components/ui/table/index.js";

	/**
	 * Headless TanStack table rendered with shadcn-svelte table markup. Every
	 * table in the admin goes through this; each page owns its own features,
	 * columns and state.
	 */
	let {
		table,
		emptyText,
		rowClass,
	}: {
		table: Table<TFeatures, TData>;
		/** Defaults to the common "No data". */
		emptyText?: string;
		rowClass?: (row: TData) => string;
	} = $props();

	const common = useIntlayer("common");
	const rows = $derived(table.getRowModel().rows);
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
						<UiTable.Cell><FlexRender {cell} /></UiTable.Cell>
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
