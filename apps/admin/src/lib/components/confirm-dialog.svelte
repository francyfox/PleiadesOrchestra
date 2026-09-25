<script lang="ts">
	import type { SubmitFunction } from "@sveltejs/kit";
	import type { Snippet } from "svelte";
	import { useIntlayer } from "svelte-intlayer";
	import { enhance } from "$app/forms";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";

	/** Confirmation dialog around a POST form action; `fields` adds inputs. */
	let {
		open = $bindable(false),
		title,
		description,
		action,
		submitLabel,
		submitted,
		fields,
	}: {
		open?: boolean;
		title: string;
		description?: string;
		action: string;
		submitLabel: string;
		submitted: SubmitFunction;
		fields?: Snippet;
	} = $props();

	const common = useIntlayer("common");
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			{#if description}<Dialog.Description>{description}</Dialog.Description>{/if}
		</Dialog.Header>
		<form method="POST" {action} use:enhance={submitted} class="grid gap-3">
			{@render fields?.()}
			<Dialog.Footer>
				<Button variant="ghost" type="button" onclick={() => (open = false)}>{$common.cancel.value}</Button>
				<Button variant="destructive" type="submit">{submitLabel}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
