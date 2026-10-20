<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import CopyValue from "#lib/components/copy-value.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";

	/** The access token right after create / rotate — shown once, never again. Open while `issued` is set. */
	let {
		issued,
		own,
		onClose,
	}: {
		issued: { email: string; token: string } | null;
		/** The token is the signed-in admin's own: their sessions are gone, so closing leads to the sign-in page. */
		own: boolean;
		onClose: () => void;
	} = $props();

	const content = useIntlayer("admins");
</script>

<Dialog.Root open={issued !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
	<Dialog.Content>
		{#if issued}
			<Dialog.Header>
				<Dialog.Title>{$content.token.title({ email: issued.email })}</Dialog.Title>
				<Dialog.Description>{$content.token.once.value}</Dialog.Description>
			</Dialog.Header>
			<div class="rounded-md border p-3"><CopyValue value={issued.token} /></div>
			{#if own}<p class="text-sm text-muted-foreground">{$content.token.ownNote.value}</p>{/if}
			<Dialog.Footer>
				<Button type="button" onclick={onClose}>{$content.token.close.value}</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
