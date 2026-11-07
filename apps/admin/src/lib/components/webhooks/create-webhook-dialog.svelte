<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { CreateWebhookInput } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { webhookActions } from "#lib/actions.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { OnceSecret } from "#lib/components/ui/once-secret/index.js";
	import { useWebhookEnhance } from "./use-webhook-enhance";
	import WebhookFields, { type WebhookFormat } from "./webhook-fields.svelte";

	/**
	 * «+ Add»: step 1 asks the name, type, URL and events, step 2 (after the server accepted it)
	 * replaces the form with the signing secret, shown once. `events` are the viewer's own.
	 */
	let {
		events,
		eventLabel,
	}: { events: string[]; eventLabel: (name: string) => string } = $props();

	const content = useIntlayer("webhooks");
	const common = useIntlayer("common");

	let open = $state(false);
	let secret = $state<string | null>(null);
	let format = $state<WebhookFormat>("json");
	$effect(() => {
		if (!open) {
			secret = null;
			format = "json";
		}
	});
	const submitted = useWebhookEnhance(
		webhookActions.create,
		undefined,
		(data) => {
			// Only our own receivers verify the signature; a chat's incoming webhook has no use for the secret.
			if (format === "json") secret = String(data.secret ?? "");
			else open = false;
		},
		{ schema: CreateWebhookInput },
		true,
	);
	const errors = submitted.errors;
</script>

<Button onclick={() => (open = true)}>
	<PlusIcon class="size-4" />
	{$common.add.value}
</Button>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-xl">
		{#if secret !== null}
			<OnceSecret
				title={$content.secret.title.value}
				description={$content.secret.once.value}
				value={secret}
				copyLabel={$content.secret.copy.value}
				doneLabel={$content.secret.done.value}
				onDone={() => (open = false)}
			/>
		{:else}
			<Dialog.Header><Dialog.Title>{$content.form.title.value}</Dialog.Title></Dialog.Header>
			<form use:submitted novalidate class="grid gap-3">
				<WebhookFields idPrefix="webhook" {events} {eventLabel} errors={$errors} bind:format />
				<Dialog.Footer>
					<Button variant="ghost" type="button" onclick={() => (open = false)}>{$common.cancel.value}</Button>
					<Button type="submit">{$content.form.confirm.value}</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
