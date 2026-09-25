<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { enhance } from "$app/forms";
	import type { AdminUser } from "$lib/api-types";
	import { Button } from "$lib/components/ui/button/index.js";
	import { useBulkEnhance } from "./use-bulk-enhance";

	/** Quick actions for one row, posted to the same `?/bulk` action. */
	let { user }: { user: AdminUser } = $props();

	const content = useIntlayer("user-actions");
	const submitted = useBulkEnhance();
</script>

<form method="POST" action="?/bulk" use:enhance={submitted} class="flex justify-end gap-1">
	<input type="hidden" name="ids" value={user.id} />
	{#if user.status === "pending"}
		<Button size="sm" variant="outline" type="submit" name="action" value="whitelist">{$content.whitelist.value}</Button>
	{/if}
	{#if user.status === "blocked"}
		<Button size="sm" variant="outline" type="submit" name="action" value="unblock">{$content.unblock.value}</Button>
	{:else}
		<Button size="sm" variant="ghost" type="submit" name="action" value="block">{$content.block.value}</Button>
	{/if}
</form>
