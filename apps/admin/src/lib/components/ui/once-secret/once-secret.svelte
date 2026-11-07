<script lang="ts">
	import CopyButton from "#lib/components/copy-button.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { Input } from "#lib/components/ui/input/index.js";

	/**
	 * A secret shown once: read-only field with a copy button and a single Done action.
	 * Content for a `Dialog.Content`; the caller owns the dialog and the texts.
	 */
	let {
		title,
		description,
		value,
		copyLabel,
		doneLabel,
		onDone,
	}: {
		title: string;
		description: string;
		value: string;
		copyLabel: string;
		doneLabel: string;
		onDone: () => void;
	} = $props();
</script>

<Dialog.Header>
	<Dialog.Title>{title}</Dialog.Title>
	<Dialog.Description>{description}</Dialog.Description>
</Dialog.Header>
<div class="flex items-center gap-2">
	<Input readonly {value} class="font-mono text-xs" onfocus={(event) => event.currentTarget.select()} />
	<CopyButton {value} label={copyLabel} />
</div>
<Dialog.Footer>
	<Button type="button" onclick={onDone}>{doneLabel}</Button>
</Dialog.Footer>
