<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
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
	<Card.Content class="grid gap-1 font-mono text-sm break-all">
		<div>publishable: {secret.publishableKey}</div>
		<div>secret: {secret.secretKey}</div>
	</Card.Content>
</Card.Root>
