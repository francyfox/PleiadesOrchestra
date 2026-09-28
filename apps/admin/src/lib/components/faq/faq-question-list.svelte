<script lang="ts">
	import { createVirtualizer } from "@tanstack/svelte-virtual";
	import { untrack } from "svelte";

	interface Item {
		id: string;
		q: string;
	}

	/** Fixed-height, virtualized list of questions; the answer is shown elsewhere, so rows never change height. */
	let {
		items,
		selected,
		onSelect,
		label,
		height = 300,
	}: {
		items: readonly Item[];
		selected: string | undefined;
		onSelect: (id: string) => void;
		label: string;
		height?: number;
	} = $props();

	const ROW_HEIGHT = 44;

	let scroller = $state<HTMLDivElement>();

	const virtualizer = createVirtualizer<HTMLDivElement, Element>({
		count: 0,
		getScrollElement: () => scroller ?? null,
		estimateSize: () => ROW_HEIGHT,
		overscan: 6,
	});

	// A new result set: tell the virtualizer the new count and go back to the top.
	$effect(() => {
		const count = items.length;
		untrack(() => {
			$virtualizer.setOptions({ count });
			$virtualizer.scrollToOffset(0);
		});
	});

	function onKeydown(event: KeyboardEvent) {
		const current = Math.max(
			0,
			items.findIndex((item) => item.id === selected),
		);
		const target =
			event.key === "ArrowDown"
				? current + 1
				: event.key === "ArrowUp"
					? current - 1
					: event.key === "Home"
						? 0
						: event.key === "End"
							? items.length - 1
							: null;
		if (target === null || items.length === 0) return;
		event.preventDefault();
		const index = Math.min(items.length - 1, Math.max(0, target));
		const item = items[index];
		if (!item) return;
		onSelect(item.id);
		$virtualizer.scrollToIndex(index);
	}
</script>

<div
	bind:this={scroller}
	role="listbox"
	tabindex="0"
	aria-label={label}
	aria-activedescendant={selected ? `faq-option-${selected}` : undefined}
	class="overflow-y-auto rounded-md border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
	style:height="{height}px"
	onkeydown={onKeydown}
>
	<div class="relative w-full" style:height="{$virtualizer.getTotalSize()}px">
		{#each $virtualizer.getVirtualItems() as row (row.key)}
			{@const item = items[row.index]}
			{#if item}
				<button
					type="button"
					role="option"
					id="faq-option-{item.id}"
					aria-selected={item.id === selected}
					tabindex="-1"
					title={item.q}
					class="absolute top-0 left-0 flex w-full items-center border-b px-3 text-left text-sm transition-colors hover:bg-muted aria-selected:bg-muted aria-selected:font-medium"
					style:height="{row.size}px"
					style:transform="translateY({row.start}px)"
					onclick={() => onSelect(item.id)}
				>
					<span class="truncate">{item.q}</span>
				</button>
			{/if}
		{/each}
	</div>
</div>
