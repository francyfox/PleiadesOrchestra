<script lang="ts">
	import type { Snippet } from "svelte";
	import * as Dialog from "#lib/components/ui/dialog/index.js";

	/** A gray gradient notice: title, text, action buttons, a picture along the bottom. */
	let {
		open = $bindable(false),
		title,
		description,
		image,
		imageAlt = "",
		actions,
	}: {
		open?: boolean;
		title: string;
		description: string;
		image: string;
		imageAlt?: string;
		actions?: Snippet;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="w-full max-w-[min(32rem,calc(100vw-2rem))] overflow-hidden border-zinc-400/40 bg-linear-to-b from-zinc-100 via-zinc-200 to-zinc-400 p-0 text-zinc-900 dark:from-zinc-700 dark:via-zinc-800 dark:to-zinc-950 dark:text-zinc-100">
		<div class="grid gap-4 px-6 pt-6">
			<Dialog.Header>
				<Dialog.Title class="text-xl">{title}</Dialog.Title>
				<Dialog.Description class="text-zinc-700 dark:text-zinc-300">{description}</Dialog.Description>
			</Dialog.Header>
			{#if actions}
				<Dialog.Footer>{@render actions()}</Dialog.Footer>
			{/if}
		</div>
		<img src={image} alt={imageAlt} width="1536" height="757" class="block h-auto w-full" />
	</Dialog.Content>
</Dialog.Root>
