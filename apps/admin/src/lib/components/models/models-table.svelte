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
	import type { Provider, ProviderModel } from "#lib/api-types.js";
	import ConfirmDialog from "#lib/components/confirm-dialog.svelte";
	import DataTable from "#lib/components/data-table.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import { MODEL_TYPE_ICONS } from "#lib/model-type-icons.js";
	import { typeLabel } from "#lib/model-types.js";
	import { useModelsEnhance } from "./use-models-enhance";

	type Row = { provider: Provider; model: ProviderModel };

	/** Every model of every provider, one row each. */
	let {
		providers,
		onEdit,
		type = "all",
	}: {
		providers: Provider[];
		onEdit: (row: Row) => void;
		/** Only the models of this type (`all` = every model). */
		type?: ProviderModel["types"][number] | "all";
	} = $props();

	const content = useIntlayer("models");
	const common = useIntlayer("common");
	let deleting = $state<Row | null>(null);
	let confirmOpen = $state(false);
	const remove = useModelsEnhance(
		providerActions.removeModel,
		() => (confirmOpen = false),
	);

	const rows = $derived(
		providers.flatMap((provider) =>
			provider.models
				.filter((model) => type === "all" || model.types.includes(type))
				.map((model) => ({ provider, model })),
		),
	);

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, Row>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor((r) => r.model.name, {
				id: "model",
				header: () => $content.models.columns.model.value,
				cell: (ctx) => renderSnippet(modelCell, ctx.row.original.model),
			}),
			helper.accessor((r) => r.model.types.join(", "), {
				id: "types",
				header: () => $content.models.columns.types.value,
				cell: (ctx) => renderSnippet(typesCell, ctx.row.original.model.types),
			}),
			helper.accessor((r) => r.provider.name, {
				id: "provider",
				header: () => $content.models.columns.provider.value,
			}),
			helper.accessor((r) => r.model.temperature, {
				id: "temperature",
				header: () => $content.models.columns.temperature.value,
				cell: (ctx) => ctx.getValue() ?? "—",
			}),
			helper.accessor((r) => r.model.reasoningEffort, {
				id: "effort",
				header: () => $content.models.columns.effort.value,
				cell: (ctx) => ctx.getValue() ?? "—",
			}),
			helper.accessor((r) => r.model.extraBody, {
				id: "extra",
				header: () => $content.models.columns.extra.value,
				cell: (ctx) => renderSnippet(extraCell, ctx.getValue()),
			}),
			helper.display({
				id: "actions",
				cell: (ctx) => renderSnippet(actions, ctx.row.original),
			}),
		]),
		get data() {
			return rows;
		},
	});
</script>

{#snippet modelCell(m: ProviderModel)}
	<span class="font-medium">{m.name}</span>
	{#if m.name !== m.id}<span class="font-mono text-xs text-muted-foreground">{m.id}</span>{/if}
{/snippet}

{#snippet typesCell(types: ProviderModel["types"])}
	<span class="flex flex-wrap gap-1">
		{#each types as type (type)}
			{@const Icon = MODEL_TYPE_ICONS[type]}
			<span class="bg-muted inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"><Icon class="size-3.5" />{typeLabel(type)}</span>
		{/each}
	</span>
{/snippet}

{#snippet extraCell(extra: Record<string, unknown>)}
	{#if Object.keys(extra).length}<span class="font-mono text-xs">{JSON.stringify(extra)}</span>{:else}—{/if}
{/snippet}

{#snippet actions(row: Row)}
	<div class="flex justify-end gap-1">
		<IconButton icon={PencilIcon} tone="primary" label={$content.edit.value} onclick={() => onEdit(row)} />
		<IconButton icon={Trash2Icon} tone="danger" label={$common.delete.value} onclick={() => ((deleting = row), (confirmOpen = true))} />
	</div>
{/snippet}

<DataTable {table} emptyText={$content.models.empty.value} />

<ConfirmDialog
	bind:open={confirmOpen}
	title={$content.models.deleteTitle({ name: deleting?.model.name ?? "" })}
	description={$content.models.deleteDescription.value}
	submitLabel={$common.delete.value}
	submitted={remove}
>
	{#snippet fields()}
		<input type="hidden" name="provider" value={deleting?.provider.id ?? ""} />
		<input type="hidden" name="model" value={deleting?.model.id ?? ""} />
	{/snippet}
</ConfirmDialog>
