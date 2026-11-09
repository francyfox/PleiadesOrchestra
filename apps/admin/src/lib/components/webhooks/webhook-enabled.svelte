<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { webhookActions } from "#lib/actions.js";
	import type { Webhook } from "#lib/api-types.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { useWebhookEnhance } from "./use-webhook-enhance";

	/** The enabled switch of a row: flipping it submits the opposite value. */
	let { item }: { item: Webhook } = $props();

	const content = useIntlayer("webhooks");
	let form = $state<HTMLFormElement>();
	const toggle = useWebhookEnhance(webhookActions.setEnabled);
</script>

<form use:toggle bind:this={form}>
	<input type="hidden" name="id" value={item.id} />
	<input type="hidden" name="enabled" value={String(!item.enabled)} />
	<Switch
		checked={item.enabled}
		aria-label={$content.toggle.value}
		onCheckedChange={() => form?.requestSubmit()}
	/>
</form>
