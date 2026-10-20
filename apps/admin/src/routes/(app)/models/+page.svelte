<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import type { Provider, ProviderModel } from "#lib/api-types.js";
	import ModelDialog from "#lib/components/models/model-dialog.svelte";
	import ModelsTable from "#lib/components/models/models-table.svelte";
	import ProviderDialog from "#lib/components/models/provider-dialog.svelte";
	import ProvidersTable from "#lib/components/models/providers-table.svelte";
	import ProvidersTomlDialog from "#lib/components/models/providers-toml-dialog.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { prefetched } from "#lib/query/prefetch.js";
	import { queries } from "#lib/query/queries.js";

	const content = useIntlayer("models");
	const query = createQuery(() => queries.providers());
	const providers = $derived(prefetched(query).items);

	let providerOpen = $state(false);
	let editingProvider = $state<Provider | null>(null);
	let modelOpen = $state(false);
	let editingModel = $state<{ provider: string; model: ProviderModel } | null>(
		null,
	);
</script>

<div class="flex flex-wrap items-start justify-between gap-3">
	<div>
		<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
		<p class="text-sm text-muted-foreground">{$content.subtitle.value}</p>
	</div>
	<div class="flex flex-wrap gap-2">
		<Button onclick={() => ((editingProvider = null), (providerOpen = true))}>
			<PlusIcon data-icon="inline-start" />{$content.providers.add.value}
		</Button>
		<Button disabled={!providers.length} onclick={() => ((editingModel = null), (modelOpen = true))}>
			<PlusIcon data-icon="inline-start" />{$content.models.add.value}
		</Button>
		<ProvidersTomlDialog />
	</div>
</div>

<h2 class="text-lg font-semibold">{$content.models.title.value}</h2>
<ModelsTable
	{providers}
	onEdit={(row) => ((editingModel = { provider: row.provider.id, model: row.model }), (modelOpen = true))}
/>

<h2 class="text-lg font-semibold">{$content.providers.title.value}</h2>
<ProvidersTable items={providers} onEdit={(p) => ((editingProvider = p), (providerOpen = true))} />

<ProviderDialog bind:open={providerOpen} provider={editingProvider} />
<ModelDialog bind:open={modelOpen} {providers} editing={editingModel} />
