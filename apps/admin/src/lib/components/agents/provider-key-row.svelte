<script lang="ts">
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { useIntlayer } from "svelte-intlayer";
	import { providerKeyActions } from "#lib/actions.js";
	import type { ProviderKey } from "#lib/api-types.js";
	import ConfirmDialog from "#lib/components/confirm-dialog.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import { useActionEnhance } from "#lib/components/use-action-enhance.js";

	let { item }: { item: ProviderKey } = $props();

	const content = useIntlayer("agents");
	const common = useIntlayer("common");
	let open = $state(false);
	const remove = useActionEnhance({
		run: providerKeyActions.remove,
		onSettled: () => (open = false),
	});
</script>

<li class="flex items-center justify-between gap-2 py-1">
	<span><span class="font-medium">{item.name}</span> <span class="font-mono text-sm text-muted-foreground">{item.mask}</span></span>
	<IconButton icon={Trash2Icon} tone="danger" label={$common.delete.value} onclick={() => (open = true)} />
	<ConfirmDialog
		bind:open
		title={$content.keys.deleteTitle({ name: item.name })}
		description={$content.keys.deleteDescription.value}
		submitLabel={$common.delete.value}
		submitted={remove}
	>
		{#snippet fields()}
			<input type="hidden" name="name" value={item.name} />
		{/snippet}
	</ConfirmDialog>
</li>
