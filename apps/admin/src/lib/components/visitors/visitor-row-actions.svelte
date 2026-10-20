<script lang="ts">
	import BanIcon from "@lucide/svelte/icons/ban";
	import LockOpenIcon from "@lucide/svelte/icons/lock-open";
	import ShieldBanIcon from "@lucide/svelte/icons/shield-ban";
	import VisitorRoundCheckIcon from "@lucide/svelte/icons/user-round-check";
	import { useIntlayer } from "svelte-intlayer";
	import type { Visitor } from "#lib/api-types.js";
	import IconButton from "#lib/components/icon-button.svelte";
	import { goto } from "$app/navigation";
	import { useBulkEnhance } from "./use-bulk-enhance";

	/** Quick actions for one row, sent through the same bulk endpoint. */
	let { visitor }: { visitor: Visitor } = $props();

	const content = useIntlayer("visitor-actions");
	const submitted = useBulkEnhance();
	const ip = $derived(visitor.ip);
</script>

<div class="flex justify-end gap-1">
	<form use:submitted class="flex gap-1">
		<input type="hidden" name="ids" value={visitor.id} />
		{#if visitor.status === "pending"}
			<IconButton icon={VisitorRoundCheckIcon} tone="success" type="submit" name="action" value="whitelist" label={$content.whitelist.value} />
		{/if}
		{#if visitor.status === "blocked"}
			<IconButton icon={LockOpenIcon} tone="success" type="submit" name="action" value="unblock" label={$content.unblock.value} />
		{:else}
			<IconButton icon={BanIcon} tone="warning" type="submit" name="action" value="block" label={$content.block.value} />
		{/if}
	</form>
	{#if ip}
		<IconButton icon={ShieldBanIcon} tone="danger" label={$content.blockIp.value} onclick={() => goto(`/blocked-ips?ip=${encodeURIComponent(ip)}`)} />
	{/if}
</div>
