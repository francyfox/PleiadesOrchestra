<script lang="ts">
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import SendIcon from "@lucide/svelte/icons/send";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { useIntlayer } from "svelte-intlayer";
	import { webhookActions } from "#lib/actions.js";
	import type { Webhook } from "#lib/api-types.js";
	import ConfirmDialog from "#lib/components/confirm-dialog.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import EditWebhookDialog from "./edit-webhook-dialog.svelte";
	import { useWebhookEnhance } from "./use-webhook-enhance";

	/** Edit, test (immediate), rotate secret and delete (both ask first); `onSecret` gets a rotated secret to show once. */
	let {
		item,
		onSecret,
		events,
		eventLabel,
	}: {
		item: Webhook;
		onSecret: (secret: string) => void;
		events: string[];
		eventLabel: (name: string) => string;
	} = $props();

	const content = useIntlayer("webhooks");

	let editOpen = $state(false);
	const test = useWebhookEnhance(webhookActions.test);

	let rotateOpen = $state(false);
	const rotate = useWebhookEnhance(
		webhookActions.rotate,
		() => (rotateOpen = false),
		(data) => onSecret(String(data.secret ?? "")),
		undefined,
		true,
	);

	let removeOpen = $state(false);
	const remove = useWebhookEnhance(
		webhookActions.remove,
		() => (removeOpen = false),
	);
</script>

<div class="flex justify-end gap-1">
	<IconButton icon={PencilIcon} tone="primary" label={$content.actions.edit.value} onclick={() => (editOpen = true)} />
	<form use:test>
		<input type="hidden" name="id" value={item.id} />
		<IconButton type="submit" icon={SendIcon} tone="primary" label={$content.actions.test.value} />
	</form>
	<IconButton icon={KeyRoundIcon} tone="warning" label={$content.actions.rotate.value} onclick={() => (rotateOpen = true)} />
	<IconButton icon={Trash2Icon} tone="danger" label={$content.actions.remove.value} onclick={() => (removeOpen = true)} />
</div>

<EditWebhookDialog {item} bind:open={editOpen} {events} {eventLabel} />

<ConfirmDialog
	bind:open={rotateOpen}
	title={$content.rotateDialog.title.value}
	description={$content.rotateDialog.description.value}
	submitLabel={$content.actions.rotate.value}
	submitted={rotate}
>
	{#snippet fields()}<input type="hidden" name="id" value={item.id} />{/snippet}
</ConfirmDialog>

<ConfirmDialog
	bind:open={removeOpen}
	title={$content.removeDialog.title.value}
	description={$content.removeDialog.description.value}
	submitLabel={$content.actions.remove.value}
	submitted={remove}
>
	{#snippet fields()}<input type="hidden" name="id" value={item.id} />{/snippet}
</ConfirmDialog>
