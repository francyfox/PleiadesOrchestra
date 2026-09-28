<script lang="ts">
	import BanIcon from "@lucide/svelte/icons/ban";
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { useIntlayer } from "svelte-intlayer";
	import { adminActions } from "$lib/actions";
	import ConfirmDialog from "$lib/components/confirm-dialog.svelte";
	import IconButton from "$lib/components/icon-button.svelte";
	import type { AdminRow } from "./admin-types";
	import { useAdminEnhance } from "./use-admin-enhance";

	/**
	 * Mirrors the server's rules (the server enforces them too): nobody acts on
	 * the super admin but the super admin; only the super admin deletes; nobody
	 * bans or deletes themselves.
	 */
	let {
		admin,
		currentAdminId,
		currentAdminIsSuper,
		onChangePassword,
	}: {
		admin: AdminRow;
		currentAdminId: string | null;
		currentAdminIsSuper: boolean;
		onChangePassword: (admin: AdminRow) => void;
	} = $props();

	const content = useIntlayer("admins");
	const unban = useAdminEnhance(adminActions.unban);
	const ban = useAdminEnhance(adminActions.ban);

	let deleteOpen = $state(false);
	const remove = useAdminEnhance(
		adminActions.remove,
		() => (deleteOpen = false),
	);

	const isSelf = $derived(admin.id === currentAdminId);
	const canChangePassword = $derived(!admin.isSuper || currentAdminIsSuper);
	const canBan = $derived(!isSelf && !admin.isSuper);
	const canDelete = $derived(currentAdminIsSuper && !isSelf && !admin.isSuper);
</script>

<div class="flex justify-end gap-1">
	{#if canChangePassword}
		<IconButton icon={KeyRoundIcon} tone="primary" label={$content.changePassword.value} onclick={() => onChangePassword(admin)} />
	{/if}
	{#if admin.banned}
		<form use:unban>
			<input type="hidden" name="id" value={admin.id} />
			<IconButton icon={ShieldCheckIcon} tone="success" type="submit" label={$content.unban.value} />
		</form>
	{:else if canBan}
		<form use:ban>
			<input type="hidden" name="id" value={admin.id} />
			<IconButton icon={BanIcon} tone="warning" type="submit" label={$content.ban.value} />
		</form>
	{/if}
	{#if canDelete}
		<IconButton icon={Trash2Icon} tone="danger" label={$content.remove.value} onclick={() => (deleteOpen = true)} />
		<ConfirmDialog
			bind:open={deleteOpen}
			title={$content.deleteDialog.title({ email: admin.email })}
			description={$content.deleteDialog.description.value}
			submitLabel={$content.remove.value}
			submitted={remove}
		>
			{#snippet fields()}
				<input type="hidden" name="id" value={admin.id} />
			{/snippet}
		</ConfirmDialog>
	{/if}
</div>
