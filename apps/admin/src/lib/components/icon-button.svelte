<script lang="ts">
	import type { LucideProps } from "@lucide/svelte";
	import type { Component } from "svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Tooltip from "$lib/components/ui/tooltip/index.js";
	import { cn } from "$lib/utils.js";

	export type IconTone =
		| "primary"
		| "success"
		| "warning"
		| "danger"
		| "neutral";

	const tones: Record<IconTone, string> = {
		primary:
			"bg-sky-500/15 text-sky-600 hover:bg-sky-500/25 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300",
		success:
			"bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300",
		warning:
			"bg-amber-500/20 text-amber-600 hover:bg-amber-500/30 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300",
		danger:
			"bg-red-500/15 text-red-600 hover:bg-red-500/25 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300",
		neutral:
			"bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
	};

	/** A bright icon-only action; `label` is the tooltip and the accessible name. */
	let {
		icon: Icon,
		label,
		tone = "neutral",
		type = "button",
		name,
		value,
		disabled = false,
		onclick,
		class: className,
	}: {
		icon: Component<LucideProps>;
		label: string;
		tone?: IconTone;
		type?: "button" | "submit";
		/** With `type="submit"`: sent with the form, so several buttons can share one. */
		name?: string;
		value?: string;
		disabled?: boolean;
		onclick?: (event: MouseEvent) => void;
		class?: string;
	} = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-sm"
				{type}
				{name}
				{value}
				{disabled}
				{onclick}
				aria-label={label}
				class={cn(tones[tone], className)}
			>
				<Icon />
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>{label}</Tooltip.Content>
</Tooltip.Root>
