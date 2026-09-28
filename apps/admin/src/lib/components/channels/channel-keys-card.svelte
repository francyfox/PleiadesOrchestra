<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import CopyValue from "$lib/components/copy-value.svelte";
	import * as Card from "$lib/components/ui/card/index.js";

	/** Keys right after create/rotate — the secret is never shown again. */
	let {
		secret,
	}: {
		secret: {
			channel: string;
			publishableKey: string | null;
			secretKey: string;
		};
	} = $props();

	const content = useIntlayer("channels");
</script>

<Card.Root class="border-amber-500">
	<Card.Header>
		<Card.Title>{$content.keys.title({ channel: secret.channel })}</Card.Title>
		<Card.Description>{$content.keys.once.value}</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-1 text-sm">
		{#if secret.publishableKey}
			<div class="flex items-center gap-2">
				<span class="w-24 shrink-0 text-muted-foreground">{$content.keys.publishable.value}</span>
				<CopyValue value={secret.publishableKey} />
			</div>
		{/if}
		<div class="flex items-center gap-2">
			<span class="w-24 shrink-0 text-muted-foreground">{$content.keys.secret.value}</span>
			<CopyValue value={secret.secretKey} />
		</div>
	</Card.Content>
</Card.Root>
