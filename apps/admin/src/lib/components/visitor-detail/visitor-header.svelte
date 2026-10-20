<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { visitorActions } from "#lib/actions.js";
	import type { Visitor } from "#lib/api-types.js";
	import ConfirmDialog from "#lib/components/confirm-dialog.svelte";
	import CopyValue from "#lib/components/copy-value.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import StatusBadge from "#lib/components/status-badge.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { useActionEnhance } from "#lib/components/use-action-enhance.js";
	import { whoisUrl } from "#lib/ip.js";

	/** Name, status badges and the whitelist/block actions of one visitor. */
	let { visitor }: { visitor: Visitor } = $props();

	const content = useIntlayer("visitor-detail");
	const actions = useIntlayer("visitor-actions");
	const common = useIntlayer("common");

	let blockOpen = $state(false);
	const whitelist = useActionEnhance({
		run: () => visitorActions.whitelist(visitor.id),
	});
	const unwhitelist = useActionEnhance({
		run: () => visitorActions.unwhitelist(visitor.id),
	});
	const unblock = useActionEnhance({
		run: () => visitorActions.unblock(visitor.id),
	});
	const block = useActionEnhance({
		run: (form) => visitorActions.block(visitor.id, form),
		onSettled: () => (blockOpen = false),
	});
</script>

<PageHeader
	backHref="/visitors"
	backLabel={$content.back.value}
	title={visitor.displayName ?? visitor.name}
>
	{#snippet meta()}
			<StatusBadge status={visitor.status} />
			<span class="inline-flex items-center gap-1 font-mono text-xs">{visitor.name}</span>
			<span class="inline-flex items-center gap-1">
				{$content.visitorId.value}
				<CopyValue value={visitor.id} label={$content.copyId.value} />
			</span>
			<Badge variant="outline">{visitor.channel.name}</Badge>
			<Badge variant="outline">{$common.visitorKind[visitor.kind].value}</Badge>
			{#if visitor.externalUserId}
				<span class="inline-flex items-center gap-1">
					{$content.channelId.value}
					<CopyValue value={visitor.externalUserId} label={$content.copyId.value} />
				</span>
			{/if}
			{#if visitor.ip}
				<span class="inline-flex items-center gap-1">
					{$content.ip.value}
					<CopyValue value={visitor.ip} href={whoisUrl(visitor.ip)} label={$actions.copyIp.value} />
				</span>
			{/if}
	{/snippet}
	{#snippet controls()}
		{#if visitor.whitelistedAt}
			<form use:unwhitelist>
				<Button variant="outline" type="submit">{$actions.unwhitelist.value}</Button>
			</form>
		{:else}
			<form use:whitelist>
				<Button variant="outline" type="submit">{$actions.whitelist.value}</Button>
			</form>
		{/if}
		{#if visitor.blockedAt}
			<form use:unblock>
				<Button variant="outline" type="submit">{$actions.unblock.value}</Button>
			</form>
		{:else}
			<Button variant="destructive" onclick={() => (blockOpen = true)}>{$actions.block.value}</Button>
		{/if}
		{#if visitor.ip}
			<Button variant="outline" href={`/blocked-ips?ip=${encodeURIComponent(visitor.ip)}`}>{$actions.blockIp.value}</Button>
		{/if}
	{/snippet}
</PageHeader>

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
