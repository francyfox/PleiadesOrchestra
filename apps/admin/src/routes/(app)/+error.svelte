<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { page } from "$app/state";
	import * as Alert from "$lib/components/ui/alert/index.js";

	const content = useIntlayer("app-error");

	// A 2xx status on the error page means the failure happened client-side
	// (see hooks.client.ts), not in a server load.
	const clientSide = $derived(page.status < 400);
</script>

<Alert.Root variant="destructive">
	<Alert.Title>{$content.title({ status: page.status })}</Alert.Title>
	<Alert.Description>
		{#if clientSide}
			<p>{$content.clientError.value}</p>
		{:else if page.status === 503}
			<p>{$content.orchestratorDown.value}</p>
		{/if}
		{#if page.error?.message}<p class="font-mono text-xs">{page.error.message}</p>{/if}
	</Alert.Description>
</Alert.Root>
