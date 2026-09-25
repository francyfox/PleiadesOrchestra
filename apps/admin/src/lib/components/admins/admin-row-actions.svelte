<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { enhance } from "$app/forms";
	import { Button } from "$lib/components/ui/button/index.js";
	import type { AdminRow } from "./admin-types";
	import { useAdminEnhance } from "./use-admin-enhance";

	/** The signed-in admin can't ban themselves (the server refuses it too). */
	let {
		admin,
		currentAdminId,
		onChangePassword,
	}: {
		admin: AdminRow;
		currentAdminId: string | null;
		onChangePassword: (admin: AdminRow) => void;
	} = $props();

	const content = useIntlayer("admins");
	const submitted = useAdminEnhance();
</script>

<div class="flex justify-end gap-1">
	<Button size="sm" variant="ghost" onclick={() => onChangePassword(admin)}>{$content.changePassword.value}</Button>
	{#if admin.banned}
		<form method="POST" action="?/unban" use:enhance={submitted}>
			<input type="hidden" name="id" value={admin.id} />
			<Button size="sm" variant="outline" type="submit">{$content.unban.value}</Button>
		</form>
	{:else if admin.id !== currentAdminId}
		<form method="POST" action="?/ban" use:enhance={submitted}>
			<input type="hidden" name="id" value={admin.id} />
			<input type="hidden" name="banned" value="false" />
			<Button size="sm" variant="ghost" type="submit">{$content.ban.value}</Button>
		</form>
	{/if}
</div>
