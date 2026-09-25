<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { enhance } from "$app/forms";
	import type { AdminUser } from "$lib/api-types";
	import ConfirmDialog from "$lib/components/confirm-dialog.svelte";
	import StatusBadge from "$lib/components/status-badge.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { useActionEnhance } from "$lib/components/use-action-enhance";

	/** Name, status badges and the whitelist/block actions of one user. */
	let { user }: { user: AdminUser } = $props();

	const content = useIntlayer("user-detail");
	const actions = useIntlayer("user-actions");
	const common = useIntlayer("common");

	let blockOpen = $state(false);
	const submitted = useActionEnhance({ onSettled: () => (blockOpen = false) });
</script>

<div class="flex flex-wrap items-start justify-between gap-4">
	<div>
		<h1 class="text-2xl font-semibold">
			{user.displayName ?? user.externalUserId ?? $content.anonymousUser.value}
		</h1>
		<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
			<StatusBadge status={user.status} />
			<Badge variant="outline">{user.channel.name}</Badge>
			<Badge variant="outline">{$common.userKind[user.kind].value}</Badge>
			{#if user.externalUserId}<span>{$content.channelId({ id: user.externalUserId })}</span>{/if}
		</div>
	</div>
	<div class="flex flex-wrap gap-2">
		{#if user.whitelistedAt}
			<form method="POST" action="?/unwhitelist" use:enhance={submitted}>
				<Button variant="outline" type="submit">{$actions.unwhitelist.value}</Button>
			</form>
		{:else}
			<form method="POST" action="?/whitelist" use:enhance={submitted}>
				<Button variant="outline" type="submit">{$actions.whitelist.value}</Button>
			</form>
		{/if}
		{#if user.blockedAt}
			<form method="POST" action="?/unblock" use:enhance={submitted}>
				<Button variant="outline" type="submit">{$actions.unblock.value}</Button>
			</form>
		{:else}
			<Button variant="destructive" onclick={() => (blockOpen = true)}>{$actions.block.value}</Button>
		{/if}
	</div>
</div>

<ConfirmDialog
	bind:open={blockOpen}
	title={$content.blockDialog.title.value}
	description={$content.blockDialog.description.value}
	action="?/block"
	submitLabel={$actions.block.value}
	{submitted}
>
	{#snippet fields()}
		<Input name="reason" placeholder={$content.blockDialog.reason.value} />
	{/snippet}
</ConfirmDialog>
