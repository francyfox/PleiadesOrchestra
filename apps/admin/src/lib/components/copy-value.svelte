<script lang="ts">
	import type { Snippet } from "svelte";
	import CopyButton from "./copy-button.svelte";

	/** A key, id or URL with the copy icon as a prefix; `href` makes the text a link (still copies `value`). */
	let {
		value,
		href,
		label,
		children,
	}: { value: string; href?: string; label?: string; children?: Snippet } =
		$props();
</script>

<span class="inline-flex min-w-0 items-center gap-1">
	<CopyButton {value} {label} />
	{#if href}
		<a {href} target="_blank" rel="external noopener noreferrer" class="min-w-0 truncate text-primary underline-offset-4 hover:underline">
			{#if children}{@render children()}{:else}{value}{/if}
		</a>
	{:else}
		<span class="min-w-0 truncate font-mono text-xs">
			{#if children}{@render children()}{:else}{value}{/if}
		</span>
	{/if}
</span>
