<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		title,
		focused = false,
		class: className = "",
		scroll = true,
		flush = false,
		header = true,
		id,
		children,
	}: {
		title: string;
		focused?: boolean;
		class?: string;
		scroll?: boolean;
		flush?: boolean;
		header?: boolean;
		id?: string;
		children: Snippet;
	} = $props();
</script>

<!-- The section spans the page; its box (border, header, content) sits in the .container. -->
<section {id} class="w-full" aria-label={title}>
<div
	class="container flex min-h-0 flex-col border {className}"
	style:border-color={focused ? 'var(--accent)' : 'var(--rule)'}
>
	{#if header}
	<div
		class="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs"
		style:border-color={focused ? 'var(--accent)' : 'var(--rule)'}
		style:color="var(--dim)"
	>
		<span aria-hidden="true" style:color={focused ? 'var(--accent)' : 'var(--dim)'}>
			{focused ? '●' : '○'}
		</span>
		{title}
	</div>
	{/if}
	<div class="min-h-0 flex-1 {flush ? '' : 'p-4'} {scroll ? 'overflow-auto' : 'overflow-hidden'}">
		{@render children()}
	</div>
</div>
</section>
