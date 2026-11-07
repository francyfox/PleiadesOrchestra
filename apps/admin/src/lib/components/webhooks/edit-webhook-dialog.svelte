<script lang="ts">
	import { EditWebhookForm } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { webhookActions } from "#lib/actions.js";
	import type { Webhook } from "#lib/api-types.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { useWebhookEnhance } from "./use-webhook-enhance";
	import WebhookFields, { type WebhookFormat } from "./webhook-fields.svelte";

	/** Name, type, URL and events of an existing webhook; open is bound by the row's pencil button. The secret is untouched. */
	let {
		item,
		open = $bindable(false),
		events,
		eventLabel,
	}: {
		item: Webhook;
		open?: boolean;
		events: string[];
		eventLabel: (name: string) => string;
	} = $props();

	const content = useIntlayer("webhooks");
	const common = useIntlayer("common");

	// svelte-ignore state_referenced_locally
	let format = $state<WebhookFormat>(item.format);
	// Closes only on success: a refused URL keeps the dialog and the input.
	const submitted = useWebhookEnhance(
		webhookActions.edit,
		undefined,
		() => (open = false),
		{ schema: EditWebhookForm },
	);
	const errors = submitted.errors;
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-xl">
		<Dialog.Header><Dialog.Title>{$content.editDialog.title.value}</Dialog.Title></Dialog.Header>
		<form use:submitted novalidate class="grid gap-3">
			<input type="hidden" name="id" value={item.id} />
			<WebhookFields
				idPrefix="edit-{item.id}"
				{events}
				{eventLabel}
				errors={$errors}
				name={item.name}
				url={item.url}
				bind:format
				selected={item.events}
			/>
			<Dialog.Footer>
				<Button variant="ghost" type="button" onclick={() => (open = false)}>{$common.cancel.value}</Button>
				<Button type="submit">{$common.save.value}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
