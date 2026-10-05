<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import SearchIcon from "@lucide/svelte/icons/search";
	import { Popover } from "bits-ui";
	import { cn } from "$lib/utils.js";

	export interface SearchSelectOption {
		value: string;
		label: string;
	}

	/**
	 * A select whose dropdown opens with a search box on top: typing narrows
	 * the options, the list is at most ~16rem tall and scrolls. A single value;
	 * `onValueChange` gets the picked option's value. Arrow keys move through
	 * the list, Enter picks, Escape closes.
	 */
	let {
		value,
		options,
		onValueChange,
		ariaLabel,
		searchPlaceholder = "",
		emptyText = "",
		class: className,
	}: {
		value: string;
		options: SearchSelectOption[];
		onValueChange: (value: string) => void;
		ariaLabel: string;
		searchPlaceholder?: string;
		emptyText?: string;
		class?: string;
	} = $props();

	let open = $state(false);
	let search = $state("");
	let highlighted = $state(0);

	const selected = $derived(options.find((option) => option.value === value));
	const shown = $derived(
		options.filter((option) =>
			option.label.toLowerCase().includes(search.trim().toLowerCase()),
		),
	);

	function pick(option: SearchSelectOption) {
		open = false;
		if (option.value !== value) onValueChange(option.value);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const step = event.key === "ArrowDown" ? 1 : -1;
			highlighted = Math.min(
				Math.max(highlighted + step, 0),
				Math.max(shown.length - 1, 0),
			);
			document
				.getElementById(`search-select-option-${highlighted}`)
				?.scrollIntoView({ block: "nearest" });
		} else if (event.key === "Enter") {
			event.preventDefault();
			const option = shown[highlighted];
			if (option) pick(option);
		}
	}
</script>

<Popover.Root
	bind:open
	onOpenChange={(next) => {
		if (next) {
			search = "";
			highlighted = Math.max(
				options.findIndex((option) => option.value === value),
				0,
			);
		}
	}}
>
	<Popover.Trigger
		aria-label={ariaLabel}
		class={cn(
			"border-input dark:bg-input/30 dark:hover:bg-input/50 focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-auto min-w-40 items-center justify-between gap-1.5 rounded-md border bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-3",
			className,
		)}
	>
		<span class="truncate">{selected?.label ?? ""}</span>
		<ChevronDownIcon class="text-muted-foreground size-4 shrink-0" />
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			align="start"
			sideOffset={4}
			class="bg-popover text-popover-foreground ring-foreground/10 z-50 w-(--bits-popover-anchor-width) min-w-48 rounded-md p-0 shadow-md ring-1"
		>
			<div class="flex items-center gap-2 border-b px-2.5">
				<SearchIcon class="text-muted-foreground size-4 shrink-0" />
				<input
					type="text"
					bind:value={search}
					oninput={() => (highlighted = 0)}
					onkeydown={onKeydown}
					placeholder={searchPlaceholder}
					aria-label={searchPlaceholder || ariaLabel}
					class="placeholder:text-muted-foreground h-9 w-full bg-transparent text-sm outline-none"
				/>
			</div>
			<div class="max-h-64 overflow-y-auto p-1" role="listbox" aria-label={ariaLabel}>
				{#each shown as option, index (option.value)}
					<button
						type="button"
						id={`search-select-option-${index}`}
						role="option"
						aria-selected={option.value === value}
						class={cn(
							"relative flex w-full cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-left text-sm outline-hidden select-none",
							index === highlighted && "bg-accent text-accent-foreground",
						)}
						onmouseenter={() => (highlighted = index)}
						onclick={() => pick(option)}
					>
						{option.label}
						{#if option.value === value}
							<CheckIcon class="absolute right-2 size-4" />
						{/if}
					</button>
				{:else}
					<div class="text-muted-foreground px-2 py-1.5 text-sm">{emptyText}</div>
				{/each}
			</div>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
