<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import type { Snippet } from "svelte";

	/**
	 * The head of a detail page: a way back to the list, the title, a line of
	 * badges/facts under it and, on the right, the page's controls.
	 */
	let {
		backHref,
		backLabel,
		title,
		meta,
		controls,
	}: {
		backHref: string;
		backLabel: string;
		title: string;
		meta?: Snippet;
		controls?: Snippet;
	} = $props();
</script>

<div class="grid min-w-0 gap-3">
	<a
		href={backHref}
		class="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
	>
		<ArrowLeftIcon class="size-4" />
		{backLabel}
	</a>
	<div class="flex min-w-0 flex-wrap items-start justify-between gap-4">
		<div class="min-w-0 flex-1">
			<h1 class="truncate text-2xl font-semibold" {title}>{title}</h1>
			{#if meta}
				<div class="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					{@render meta()}
				</div>
			{/if}
		</div>
		{#if controls}
			<div class="flex flex-wrap gap-2">{@render controls()}</div>
		{/if}
	</div>
</div>
