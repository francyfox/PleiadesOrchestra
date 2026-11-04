<script lang="ts">
	import * as Tooltip from "#lib/components/ui/tooltip/index.js";
	import { cn } from "#lib/utils.js";

	/** Text with a tooltip on hover and keyboard focus (e.g. a rounded value and its exact one); cut with an ellipsis when it does not fit, the tooltip still has it all. */
	let {
		text,
		hint,
		class: className,
	}: { text: string; hint: string; class?: string } = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<span {...props} tabindex="0" class={cn("inline-block max-w-full cursor-help truncate align-bottom underline decoration-dotted underline-offset-4", className)}>{text}</span>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>{hint}</Tooltip.Content>
</Tooltip.Root>
