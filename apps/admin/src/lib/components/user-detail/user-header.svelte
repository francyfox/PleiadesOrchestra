<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { userActions } from "$lib/actions";
	import type { AdminUser } from "$lib/api-types";
	import ConfirmDialog from "$lib/components/confirm-dialog.svelte";
	import CopyValue from "$lib/components/copy-value.svelte";
	import StatusBadge from "$lib/components/status-badge.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { useActionEnhance } from "$lib/components/use-action-enhance";
	import { whoisUrl } from "$lib/ip";

	/** Name, status badges and the whitelist/block actions of one user. */
	let { user }: { user: AdminUser } = $props();

	const content = useIntlayer("user-detail");
	const actions = useIntlayer("user-actions");
	const common = useIntlayer("common");

	let blockOpen = $state(false);
	const whitelist = useActionEnhance({
		run: () => userActions.whitelist(user.id),
	});
	const unwhitelist = useActionEnhance({
		run: () => userActions.unwhitelist(user.id),
	});
	const unblock = useActionEnhance({ run: () => userActions.unblock(user.id) });
	const block = useActionEnhance({
		run: (form) => userActions.block(user.id, form),
		onSettled: () => (blockOpen = false),
	});
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
			{#if user.externalUserId}
				<span class="inline-flex items-center gap-1">
					{$content.channelId.value}
					<CopyValue value={user.externalUserId} label={$content.copyId.value} />
				</span>
			{/if}
			{#if user.ip}
				<span class="inline-flex items-center gap-1">
					{$content.ip.value}
					<CopyValue value={user.ip} href={whoisUrl(user.ip)} label={$actions.copyIp.value} />
				</span>
			{/if}
		</div>
	</div>
	<div class="flex flex-wrap gap-2">
		{#if user.whitelistedAt}
			<form use:unwhitelist>
				<Button variant="outline" type="submit">{$actions.unwhitelist.value}</Button>
			</form>
		{:else}
			<form use:whitelist>
				<Button variant="outline" type="submit">{$actions.whitelist.value}</Button>
			</form>
		{/if}
		{#if user.blockedAt}
			<form use:unblock>
				<Button variant="outline" type="submit">{$actions.unblock.value}</Button>
			</form>
		{:else}
			<Button variant="destructive" onclick={() => (blockOpen = true)}>{$actions.block.value}</Button>
		{/if}
		{#if user.ip}
			<Button variant="outline" href={`/blocked-ips?ip=${encodeURIComponent(user.ip)}`}>{$actions.blockIp.value}</Button>
		{/if}
	</div>
</div>

<ConfirmDialog
	bind:open={blockOpen}
	title={$content.blockDialog.title.value}
	description={$content.blockDialog.description.value}
	submitLabel={$actions.block.value}
	submitted={block}
>
	{#snippet fields()}
		<Input name="reason" placeholder={$content.blockDialog.reason.value} />
	{/snippet}
</ConfirmDialog>
