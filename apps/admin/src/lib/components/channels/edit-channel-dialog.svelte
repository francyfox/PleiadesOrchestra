<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { enhance } from "$app/forms";
	import type { Channel } from "$lib/api-types";
	import FormField from "$lib/components/form-field.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import AccessModeSelect from "./access-mode-select.svelte";
	import { useChannelEnhance } from "./use-channel-enhance";

	/** Open while `channel` is set; `onClose` clears it. */
	let { channel, onClose }: { channel: Channel | null; onClose: () => void } =
		$props();

	const content = useIntlayer("channels");
	const common = useIntlayer("common");
	const submitted = useChannelEnhance(() => onClose());
</script>

<Dialog.Root open={channel !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
	<Dialog.Content>
		{#if channel}
			<Dialog.Header><Dialog.Title>{$content.editTitle({ name: channel.name })}</Dialog.Title></Dialog.Header>
			<form method="POST" action="?/update" use:enhance={submitted} class="grid gap-3">
				<input type="hidden" name="id" value={channel.id} />
				<FormField id="edit-name" name="name" label={$content.create.name.value} value={channel.name} />
				<div class="grid gap-2">
					<Label for="edit-access">{$content.columns.access.value}</Label>
					<AccessModeSelect id="edit-access" value={channel.accessMode} />
				</div>
				{#if channel.kind === "web"}
					<div class="grid gap-2">
						<Label for="edit-origins">{$content.allowedOrigins.value}</Label>
						<Textarea id="edit-origins" name="allowedOrigins" value={channel.allowedOrigins.join("\n")} />
					</div>
				{/if}
				<Dialog.Footer>
					<Button variant="ghost" type="button" onclick={onClose}>{$common.cancel.value}</Button>
					<Button type="submit">{$common.save.value}</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
