<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { Agent } from "$lib/api-types";
	import CopyValue from "$lib/components/copy-value.svelte";
	import DataTable from "$lib/components/data-table.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { useFormat } from "$lib/i18n/use-format";
	import { levelBadgeClass, levelDotClass } from "../level-styles";

	let { agents }: { agents: Agent[] } = $props();

	const content = useIntlayer("agents");
	const format = useFormat();

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, Agent>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("name", {
				header: () => $content.columns.agent.value,
				cell: (ctx) => renderSnippet(nameCell, ctx.row.original),
			}),
			helper.accessor("endpoint", {
				header: () => $content.columns.endpoint.value,
				cell: (ctx) => renderSnippet(endpointCell, ctx.getValue()),
			}),
			helper.accessor("model", {
				header: () => $content.columns.model.value,
				cell: (ctx) => ctx.getValue() ?? "—",
			}),
			helper.accessor("status", {
				header: () => $content.columns.status.value,
				cell: (ctx) => renderSnippet(statusCell, ctx.getValue()),
			}),
			helper.accessor("latencyMs", {
				header: () => $content.columns.latency.value,
				cell: (ctx) => {
					const value = ctx.getValue();
					return value === null
						? "—"
						: `${$format.number(value)} ${$content.ms.value}`;
				},
			}),
			helper.accessor("checkedAt", {
				header: () => $content.columns.checked.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
		]),
		get data() {
			return agents;
		},
	});
</script>

{#snippet nameCell(agent: Agent)}
	<span class="font-medium">{agent.name}</span>
	<Badge variant="outline" class="ml-1">{$content.role[agent.role].value}</Badge>
{/snippet}

{#snippet endpointCell(endpoint: string)}
	<CopyValue value={endpoint} href={endpoint} />
{/snippet}

{#snippet statusCell(status: Agent["status"])}
	{@const level = status === "up" ? "ok" : "critical"}
	<Badge variant="ghost" class="gap-1.5 {levelBadgeClass[level]}">
		<span class="size-2 shrink-0 rounded-full {levelDotClass[level]}" aria-hidden="true"></span>
		{$content.status[status].value}
	</Badge>
{/snippet}

<DataTable {table} emptyText={$content.empty.value} />
