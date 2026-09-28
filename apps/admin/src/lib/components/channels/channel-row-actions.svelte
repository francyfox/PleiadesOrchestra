<script lang="ts">
	import CodeXmlIcon from "@lucide/svelte/icons/code-xml";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PowerIcon from "@lucide/svelte/icons/power";
	import PowerOffIcon from "@lucide/svelte/icons/power-off";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import { useIntlayer } from "svelte-intlayer";
	import { channelActions } from "$lib/actions";
	import type { Channel } from "$lib/api-types";
	import ConfirmDialog from "$lib/components/confirm-dialog.svelte";
	import IconButton from "$lib/components/icon-button.svelte";
	import EmbedDialog from "./embed-dialog.svelte";
	import { useChannelEnhance } from "./use-channel-enhance";

	/** Edit / enable-disable / rotate keys. There is deliberately no delete: a channel is only ever disabled. */
	let {
		channel,
		onEdit,
	}: { channel: Channel; onEdit: (channel: Channel) => void } = $props();

	const content = useIntlayer("channels");
	const toggle = useChannelEnhance(channelActions.toggle);

	let embedOpen = $state(false);
	let rotateOpen = $state(false);
	const rotate = useChannelEnhance(
		channelActions.rotate,
		() => (rotateOpen = false),
	);
</script>

<div class="flex justify-end gap-1">
	{#if channel.kind === "web" && channel.publishableKey}
		<IconButton icon={CodeXmlIcon} tone="primary" label={$content.embed.action.value} onclick={() => (embedOpen = true)} />
		<EmbedDialog {channel} bind:open={embedOpen} />
	{/if}
	<IconButton icon={PencilIcon} tone="primary" label={$content.edit.value} onclick={() => onEdit(channel)} />
	<form use:toggle>
		<input type="hidden" name="id" value={channel.id} />
		<input type="hidden" name="disabled" value={channel.disabledAt ? "false" : "true"} />
		{#if channel.disabledAt}
			<IconButton icon={PowerIcon} tone="success" type="submit" label={$content.enable.value} />
		{:else}
			<IconButton icon={PowerOffIcon} tone="warning" type="submit" label={$content.disable.value} />
		{/if}
	</form>
	{#if channel.kind === "web"}
		<IconButton icon={RefreshCwIcon} tone="warning" label={$content.rotateKeys.value} onclick={() => (rotateOpen = true)} />
		<ConfirmDialog
			bind:open={rotateOpen}
			title={$content.rotateConfirm.title({ name: channel.name })}
			description={$content.rotateConfirm.description.value}
			submitLabel={$content.rotateKeys.value}
			submitted={rotate}
		>
			{#snippet fields()}
				<input type="hidden" name="id" value={channel.id} />
			{/snippet}
		</ConfirmDialog>
	{/if}
</div>
