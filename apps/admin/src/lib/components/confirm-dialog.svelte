<script lang="ts">
	import type { Snippet } from "svelte";
	import type { Action } from "svelte/action";
	import { useIntlayer } from "svelte-intlayer";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";

	/** Confirmation dialog around a form submitted with `submitted` (`useActionEnhance`); `fields` adds inputs. */
	let {
		open = $bindable(false),
		title,
		description,
		submitLabel,
		submitted,
		fields,
	}: {
		open?: boolean;
		title: string;
		description?: string;
		submitLabel: string;
		submitted: Action<HTMLFormElement>;
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
		<form use:submitted class="grid gap-3">
			{@render fields?.()}
			<Dialog.Footer>
				<Button variant="ghost" type="button" onclick={() => (open = false)}>{$common.cancel.value}</Button>
				<Button variant="destructive" type="submit">{submitLabel}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
