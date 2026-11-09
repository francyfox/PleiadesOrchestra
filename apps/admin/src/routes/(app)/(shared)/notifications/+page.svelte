<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { OnceSecret } from "#lib/components/ui/once-secret/index.js";
	import CreateWebhookDialog from "#lib/components/webhooks/create-webhook-dialog.svelte";
	import WebhooksTable from "#lib/components/webhooks/webhooks-table.svelte";
	import { isStaff } from "#lib/guards.js";
	import { prefetched } from "#lib/query/prefetch.js";
	import { queries } from "#lib/query/queries.js";
	import { page } from "$app/state";

	const content = useIntlayer("webhooks");
	const list = createQuery(() => queries.webhooks());
	const data = $derived(prefetched(list));

	// A customer is offered only the events of their scope; the server enforces it too.
	const staff = $derived(isStaff(page.data.admin?.level ?? 200));
	const offered = $derived(
		data.events
			.filter((event) => event.scope !== (staff ? "owner" : "staff"))
			.map((event) => event.name),
	);
	const eventLabel = (name: string) =>
		($content.events as Record<string, { value: string }>)[name]?.value ?? name;

	// A rotated secret, shown once.
	let rotated = $state<string | null>(null);
</script>

<div>
	<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
	<p class="text-sm text-muted-foreground">{$content.subtitle.value}</p>
</div>

<div><CreateWebhookDialog events={offered} {eventLabel} /></div>

<WebhooksTable items={data.items} events={offered} {eventLabel} onSecret={(secret) => (rotated = secret)} />

<Dialog.Root open={rotated !== null} onOpenChange={(open) => { if (!open) rotated = null; }}>
	<Dialog.Content>
		{#if rotated !== null}
			<OnceSecret
				title={$content.secret.title.value}
				description={$content.secret.once.value}
				value={rotated}
				copyLabel={$content.secret.copy.value}
				doneLabel={$content.secret.done.value}
				onDone={() => (rotated = null)}
			/>
		{/if}
	</Dialog.Content>
</Dialog.Root>
