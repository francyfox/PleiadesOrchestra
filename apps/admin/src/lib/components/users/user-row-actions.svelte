<script lang="ts">
	import BanIcon from "@lucide/svelte/icons/ban";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { useIntlayer } from "svelte-intlayer";
	import { accountActions } from "#lib/actions.js";
	import type { Customer } from "#lib/api-types.js";
	import ConfirmDialog from "#lib/components/confirm-dialog.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import { useUserEnhance } from "./use-user-enhance";

	let { user }: { user: Customer } = $props();

	const content = useIntlayer("users");
	const ban = useUserEnhance(accountActions.ban);
	const unban = useUserEnhance(accountActions.unban);

	let deleteOpen = $state(false);
	const remove = useUserEnhance(
		accountActions.remove,
		() => (deleteOpen = false),
	);
</script>

<div class="flex justify-end gap-1">
	{#if user.banned}
		<form use:unban>
			<input type="hidden" name="id" value={user.id} />
			<IconButton icon={ShieldCheckIcon} tone="success" type="submit" label={$content.unban.value} />
		</form>
	{:else}
		<form use:ban>
			<input type="hidden" name="id" value={user.id} />
			<IconButton icon={BanIcon} tone="warning" type="submit" label={$content.ban.value} />
		</form>
	{/if}
	<IconButton icon={Trash2Icon} tone="danger" label={$content.remove.value} onclick={() => (deleteOpen = true)} />
	<ConfirmDialog
		bind:open={deleteOpen}
		title={$content.deleteDialog.title({ email: user.email })}
		description={$content.deleteDialog.description.value}
		submitLabel={$content.remove.value}
		submitted={remove}
	>
		{#snippet fields()}
			<input type="hidden" name="id" value={user.id} />
		{/snippet}
	</ConfirmDialog>
</div>
