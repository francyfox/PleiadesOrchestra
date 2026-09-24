<script lang="ts">
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import ArrowUpDownIcon from "@lucide/svelte/icons/arrow-up-down";
	import { Button } from "$lib/components/ui/button/index.js";

	/** `sorted` is the column's `getIsSorted()`; `onToggle` its sorting handler. */
	let {
		label,
		sorted,
		onToggle,
	}: {
		label: string;
		sorted: false | "asc" | "desc";
		onToggle: ((event: unknown) => void) | undefined;
	} = $props();
</script>

<Button variant="ghost" size="sm" class="-ml-2" onclick={(event) => onToggle?.(event)}>
	{label}
	{#if sorted === "asc"}
		<ArrowUpIcon />
	{:else if sorted === "desc"}
		<ArrowDownIcon />
	{:else}
		<ArrowUpDownIcon class="opacity-40" />
	{/if}
</Button>
