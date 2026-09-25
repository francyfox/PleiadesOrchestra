<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { enhance } from "$app/forms";
	import type { Channel } from "$lib/api-types";
	import { Button } from "$lib/components/ui/button/index.js";
	import { useChannelEnhance } from "./use-channel-enhance";

	let {
		channel,
		onEdit,
	}: { channel: Channel; onEdit: (channel: Channel) => void } = $props();

	const content = useIntlayer("channels");
	const submitted = useChannelEnhance();
</script>

<div class="flex justify-end gap-1">
	<Button size="sm" variant="ghost" onclick={() => onEdit(channel)}>{$content.edit.value}</Button>
	<form method="POST" action="?/toggle" use:enhance={submitted}>
		<input type="hidden" name="id" value={channel.id} />
		<input type="hidden" name="disabled" value={channel.disabledAt ? "false" : "true"} />
		<Button size="sm" variant="ghost" type="submit">
			{channel.disabledAt ? $content.enable.value : $content.disable.value}
		</Button>
	</form>
	{#if channel.kind === "web"}
		<form method="POST" action="?/rotate" use:enhance={submitted}>
			<input type="hidden" name="id" value={channel.id} />
			<Button size="sm" variant="ghost" type="submit">{$content.rotateKeys.value}</Button>
		</form>
	{/if}
</div>
