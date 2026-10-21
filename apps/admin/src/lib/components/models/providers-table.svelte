<script lang="ts">
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import {
		createColumnHelper,
		createTable,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import { providerActions } from "#lib/actions.js";
	import type { Provider } from "#lib/api-types.js";
	import ConfirmDialog from "#lib/components/confirm-dialog.svelte";
	import CopyValue from "#lib/components/copy-value.svelte";
	import DataTable from "#lib/components/data-table.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import { useModelsEnhance } from "./use-models-enhance";

	let {
		items,
		onEdit,
	}: { items: Provider[]; onEdit: (provider: Provider) => void } = $props();

	const content = useIntlayer("models");
	const common = useIntlayer("common");
	let deleting = $state<Provider | null>(null);
	let confirmOpen = $state(false);
	const remove = useModelsEnhance(
		providerActions.remove,
		() => (confirmOpen = false),
	);

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, Provider>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("name", {
				header: () => $content.providers.columns.name.value,
				cell: (ctx) => renderSnippet(nameCell, ctx.row.original),
			}),
			helper.accessor("baseUrl", {
				header: () => $content.providers.columns.baseUrl.value,
				cell: (ctx) => renderSnippet(urlCell, ctx.getValue()),
			}),
			helper.accessor("apiKey", {
				header: () => $content.providers.columns.key.value,
				cell: (ctx) => renderSnippet(keyCell, ctx.getValue()),
			}),
			helper.accessor((p) => p.models.length, {
				id: "models",
				header: () => $content.providers.columns.models.value,
			}),
			helper.display({
				id: "actions",
				cell: (ctx) => renderSnippet(actions, ctx.row.original),
			}),
		]),
		get data() {
			return items;
		},
	});
</script>

{#snippet nameCell(p: Provider)}
	<span class="font-medium">{p.name}</span> <span class="font-mono text-xs text-muted-foreground">{p.id}</span>
{/snippet}

{#snippet urlCell(url: string)}
	{#if url}<CopyValue value={url} label={url} />{:else}<span class="text-muted-foreground">{$content.providers.inProcess.value}</span>{/if}
{/snippet}

{#snippet keyCell(key: string)}
	{#if key}<span class="font-mono text-sm">{key}</span>{:else}<span class="text-muted-foreground">{$content.providers.noKey.value}</span>{/if}
{/snippet}

{#snippet actions(p: Provider)}
	<div class="flex justify-end gap-1">
		<IconButton icon={PencilIcon} tone="primary" label={$content.edit.value} onclick={() => onEdit(p)} />
		<IconButton icon={Trash2Icon} tone="danger" label={$common.delete.value} onclick={() => ((deleting = p), (confirmOpen = true))} />
	</div>
{/snippet}

<DataTable {table} emptyText={$content.providers.empty.value} />

<ConfirmDialog
	bind:open={confirmOpen}
	title={$content.providers.deleteTitle({ name: deleting?.name ?? "" })}
	description={$content.providers.deleteDescription.value}
	submitLabel={$common.delete.value}
	submitted={remove}
>
	{#snippet fields()}
		<input type="hidden" name="id" value={deleting?.id ?? ""} />
	{/snippet}
</ConfirmDialog>
