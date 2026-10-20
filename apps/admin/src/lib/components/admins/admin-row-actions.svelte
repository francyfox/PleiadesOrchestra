<script lang="ts">
	import BanIcon from "@lucide/svelte/icons/ban";
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { useIntlayer } from "svelte-intlayer";
	import { adminActions } from "#lib/actions.js";
	import ConfirmDialog from "#lib/components/confirm-dialog.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import type { AdminRow } from "./admin-types";
	import { useAdminEnhance } from "./use-admin-enhance";

	/**
	 * Mirrors the server's rules (the server enforces them too): you manage
	 * your own name, email and token, a super admin manages anyone's; nobody
	 * bans the super admin; only a super admin deletes; nobody bans or deletes themselves.
	 */
	let {
		admin,
		currentAdminId,
		currentAdminIsSuper,
		onEdit,
		onIssued,
	}: {
		admin: AdminRow;
		currentAdminId: string | null;
		currentAdminIsSuper: boolean;
		onEdit: (admin: AdminRow) => void;
		onIssued: (email: string, token: string, own: boolean) => void;
	} = $props();

	const content = useIntlayer("admins");
	const unban = useAdminEnhance(adminActions.unban);
	const ban = useAdminEnhance(adminActions.ban);

	let deleteOpen = $state(false);
	const remove = useAdminEnhance(
		adminActions.remove,
		() => (deleteOpen = false),
	);

	let rotateOpen = $state(false);
	const rotate = useAdminEnhance(
		adminActions.rotateToken,
		() => (rotateOpen = false),
		(data) =>
			onIssued(
				String(data.email ?? admin.email),
				String(data.token ?? ""),
				isSelf,
			),
	);

	const isSelf = $derived(admin.id === currentAdminId);
	const canManage = $derived(isSelf || currentAdminIsSuper);
	const canBan = $derived(!isSelf && !admin.isSuper);
	const canDelete = $derived(currentAdminIsSuper && !isSelf);
</script>

<div class="flex justify-end gap-1">
	{#if canManage}
		<IconButton icon={PencilIcon} tone="primary" label={$content.edit.value} onclick={() => onEdit(admin)} />
		<IconButton icon={KeyRoundIcon} tone="primary" label={$content.rotateToken.value} onclick={() => (rotateOpen = true)} />
		<ConfirmDialog
			bind:open={rotateOpen}
			title={$content.rotateDialog.title({ email: admin.email })}
			description={$content.rotateDialog.description.value}
			submitLabel={$content.rotateToken.value}
			submitted={rotate}
		>
			{#snippet fields()}
				<input type="hidden" name="id" value={admin.id} />
			{/snippet}
		</ConfirmDialog>
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
