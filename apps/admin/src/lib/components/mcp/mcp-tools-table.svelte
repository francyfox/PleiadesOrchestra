<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { McpParam, McpTool } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";

	/** The functions of one site: name, what it does, and each parameter with its type and allowed values. */
	let { tools }: { tools: McpTool[] } = $props();

	const content = useIntlayer("mcp");

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, McpTool>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("name", {
				header: () => $content.tools.columns.name.value,
				cell: (ctx) => renderSnippet(nameCell, ctx.getValue()),
			}),
			helper.accessor("description", {
				header: () => $content.tools.columns.description.value,
				cell: (ctx) => ctx.getValue() ?? "—",
			}),
			helper.accessor("params", {
				header: () => $content.tools.columns.params.value,
				cell: (ctx) => renderSnippet(paramsCell, ctx.getValue()),
			}),
		]),
		get data() {
			return tools;
		},
	});
</script>

{#snippet nameCell(name: string)}
	<span class="font-mono text-xs font-medium">{name}</span>
{/snippet}

{#snippet paramsCell(params: McpParam[])}
	{#if params.length === 0}
		<span class="text-muted-foreground">{$content.tools.noParams.value}</span>
	{:else}
		<ul class="flex flex-col gap-1">
			{#each params as param (param.name)}
				<li class="text-xs">
					<span class="font-mono font-medium">{param.name}</span>{#if param.required}<span
							class="text-destructive"
							title={$content.tools.required.value}>*</span
						>{/if}
					{#if param.type}<span class="font-mono text-muted-foreground">: {param.type}</span>{/if}
					{#if param.values}<span class="text-muted-foreground"> ({param.values.join(" | ")})</span>{/if}
					{#if param.description}<div class="text-muted-foreground">{param.description}</div>{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<DataTable {table} wrap emptyText={$content.tools.empty.value} />
