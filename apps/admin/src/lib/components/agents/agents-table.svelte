<script lang="ts">
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import {
		createColumnHelper,
		createTable,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { Agent } from "#lib/api-types.js";
	import CopyValue from "#lib/components/copy-value.svelte";
	import DataTable from "#lib/components/data-table.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import { levelBadgeClass, levelDotClass } from "../level-styles";
	import AgentSettingsDialog from "./agent-settings-dialog.svelte";

	let { agents }: { agents: Agent[] } = $props();

	const content = useIntlayer("agents");
	const format = useFormat();

	let editing = $state<Agent | null>(null);
	let dialogOpen = $state(false);

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
			// The health probe (the ping) and the mean of real calls over the last day (the response) are different things.
			helper.accessor("latencyMs", {
				header: () => $content.columns.ping.value,
				cell: (ctx) => $format.ms(ctx.getValue()),
			}),
			helper.accessor("responseMs", {
				header: () => $content.columns.response.value,
				cell: (ctx) => $format.ms(ctx.getValue()),
			}),
			helper.accessor("checkedAt", {
				header: () => $content.columns.checked.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.display({
				id: "actions",
				header: "",
				cell: (ctx) => renderSnippet(actionsCell, ctx.row.original),
			}),
		]),
		get data() {
			return agents;
		},
	});
</script>

{#snippet actionsCell(agent: Agent)}
	<div class="flex justify-end">
		<IconButton icon={SettingsIcon} tone="primary" label={$content.settings.action.value} onclick={() => {
			editing = agent;
			dialogOpen = true;
		}} />
	</div>
{/snippet}

{#snippet nameCell(agent: Agent)}
	<span class="font-medium">{agent.name}</span>
	<Badge variant="outline" class="ml-1" title={agent.role === "understand" ? $content.roleHint.understand.value : undefined}>{$content.role[agent.role].value}</Badge>
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

{#if editing}
	<AgentSettingsDialog agent={editing} bind:open={dialogOpen} />
{/if}
