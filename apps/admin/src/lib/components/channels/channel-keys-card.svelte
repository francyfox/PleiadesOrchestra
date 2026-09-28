<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import CopyValue from "$lib/components/copy-value.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
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
	<Card.Content class="grid gap-4 text-sm">
		{#if secret.publishableKey}
			<div class="grid gap-1">
				<div class="flex flex-wrap items-center gap-2">
					<Badge variant="outline" class="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
						{$content.keys.publishable.value}
					</Badge>
					<CopyValue value={secret.publishableKey} />
				</div>
				<p class="text-xs text-muted-foreground">{$content.keys.publishableHint.value}</p>
			</div>
		{/if}
		<div class="grid gap-1">
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="destructive">{$content.keys.secret.value}</Badge>
				<CopyValue value={secret.secretKey} />
			</div>
			<p class="text-xs text-muted-foreground">{$content.keys.secretHint.value}</p>
		</div>
	</Card.Content>
</Card.Root>
