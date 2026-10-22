<script lang="ts">
	import type { LucideProps } from "@lucide/svelte";
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import SearchIcon from "@lucide/svelte/icons/search";
	import XIcon from "@lucide/svelte/icons/x";
	import { Popover } from "bits-ui";
	import type { Component } from "svelte";
	import { cn } from "#lib/utils.js";

	export interface SearchMultiSelectOption {
		value: string;
		label: string;
		icon?: Component<LucideProps>;
	}

	/**
	 * `SearchSelect` for several values: the dropdown stays open while options
	 * are ticked, a search box narrows the list, arrows move, Enter ticks,
	 * Escape closes. Each picked value is also a hidden input named `name`, so
	 * a plain form submits them (`formData.getAll(name)`).
	 */
	let {
		values = $bindable([]),
		options,
		name,
		ariaLabel,
		searchPlaceholder = "",
		emptyText = "",
		clearLabel = "Clear",
		removeLabel = (label: string) => `Remove ${label}`,
		required = false,
		invalid = false,
		class: className,
	}: {
		values?: string[];
		options: SearchMultiSelectOption[];
		name: string;
		ariaLabel: string;
		searchPlaceholder?: string;
		emptyText?: string;
		/** Accessible names of the clear-all button and of a chip's remove button. */
		clearLabel?: string;
		removeLabel?: (label: string) => string;
		/** Sets `aria-required`; the `*` is the caller's Label. */
		required?: boolean;
		/** Red border; the caller shows the message. */
		invalid?: boolean;
		class?: string;
	} = $props();

	let open = $state(false);
	let box = $state<HTMLElement | null>(null);
	let search = $state("");
	let highlighted = $state(0);

	const picked = $derived(options.filter((o) => values.includes(o.value)));
	const shown = $derived(
		options.filter((o) =>
			o.label.toLowerCase().includes(search.trim().toLowerCase()),
		),
	);

	function toggle(option: SearchMultiSelectOption) {
		values = values.includes(option.value)
			? values.filter((v) => v !== option.value)
			: options
					.map((o) => o.value)
					.filter((v) => v === option.value || values.includes(v));
	}

	const remove = (value: string) => (values = values.filter((v) => v !== value));

	function onKeydown(event: KeyboardEvent) {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const step = event.key === "ArrowDown" ? 1 : -1;
			highlighted = Math.min(
				Math.max(highlighted + step, 0),
				Math.max(shown.length - 1, 0),
			);
			document
				.getElementById(`search-multi-option-${name}-${highlighted}`)
				?.scrollIntoView({ block: "nearest" });
		} else if (event.key === "Enter") {
			event.preventDefault();
			const option = shown[highlighted];
			if (option) toggle(option);
		}
	}
</script>

{#each values as value (value)}
	<input type="hidden" {name} {value} />
{/each}
<Popover.Root
	bind:open
	onOpenChange={(next) => {
		if (next) {
			search = "";
			highlighted = 0;
		}
	}}
>
	<!-- The box is the anchor; chips and the clear button are its own buttons, so none sits inside the trigger button. -->
	<div
		bind:this={box}
		class={cn(
			"border-input dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/50 flex min-h-8 w-full items-start gap-1 rounded-md border bg-transparent py-1 pr-1 pl-2 text-sm shadow-xs transition-[color,box-shadow] focus-within:ring-3",
			invalid && "border-destructive",
			className,
		)}
	>
		<div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
			{#each picked as option (option.value)}
				{@const Icon = option.icon}
				<span class="bg-muted text-foreground inline-flex items-center gap-1 rounded py-0.5 pr-0.5 pl-1.5 text-xs">
					{#if Icon}<Icon class="size-3.5" />{/if}{option.label}
					<button
						type="button"
						aria-label={removeLabel(option.label)}
						class="hover:bg-foreground/10 rounded-sm p-0.5 outline-none focus-visible:ring-2"
						onclick={() => remove(option.value)}
					>
						<XIcon class="size-3" />
					</button>
				</span>
			{/each}
			<Popover.Trigger aria-label={ariaLabel} aria-required={required} aria-invalid={invalid} class="min-h-6 min-w-8 flex-1 self-stretch text-left outline-none" />
		</div>
		{#if values.length}
			<button
				type="button"
				aria-label={clearLabel}
				class="text-muted-foreground hover:text-foreground rounded-sm p-1 outline-none focus-visible:ring-2"
				onclick={() => (values = [])}
			>
				<XIcon class="size-4" />
			</button>
		{/if}
		<Popover.Trigger aria-label={ariaLabel} class="text-muted-foreground rounded-sm p-1 outline-none">
			<ChevronDownIcon class="size-4" />
		</Popover.Trigger>
	</div>
	<Popover.Portal>
		<Popover.Content
			align="start"
			sideOffset={4}
			customAnchor={box}
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
			<div class="max-h-64 overflow-y-auto p-1" role="listbox" aria-multiselectable="true" aria-label={ariaLabel}>
				{#each shown as option, index (option.value)}
					{@const Icon = option.icon}
					<button
						type="button"
						id={`search-multi-option-${name}-${index}`}
						role="option"
						aria-selected={values.includes(option.value)}
						class={cn(
							"relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-left text-sm outline-hidden select-none",
							index === highlighted && "bg-accent text-accent-foreground",
						)}
						onmouseenter={() => (highlighted = index)}
						onclick={() => toggle(option)}
					>
						{#if Icon}<Icon class="text-muted-foreground size-4 shrink-0" />{/if}
						{option.label}
						{#if values.includes(option.value)}
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
