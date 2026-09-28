<script lang="ts">
	import ShieldOffIcon from "@lucide/svelte/icons/shield-off";
	import { useIntlayer } from "svelte-intlayer";
	import { blockedIpActions } from "$lib/actions";
	import type { BlockedIp } from "$lib/api-types";
	import ConfirmDialog from "$lib/components/confirm-dialog.svelte";
	import IconButton from "$lib/components/icon-button.svelte";
	import { useBlockedIpEnhance } from "./use-blocked-ip-enhance";

	/** Lifting a block deletes the row, so it asks first. */
	let { item }: { item: BlockedIp } = $props();

	const content = useIntlayer("blocked-ips");
	let open = $state(false);
	const submitted = useBlockedIpEnhance(
		blockedIpActions.remove,
		() => (open = false),
	);
</script>

<div class="flex justify-end">
	<IconButton icon={ShieldOffIcon} tone="success" label={$content.lift.value} onclick={() => (open = true)} />
</div>

<ConfirmDialog
	bind:open
	title={$content.liftDialog.title.value}
	description={$content.liftDialog.description.value}
	submitLabel={$content.lift.value}
	{submitted}
>
	{#snippet fields()}
		<input type="hidden" name="id" value={item.id} />
	{/snippet}
</ConfirmDialog>
