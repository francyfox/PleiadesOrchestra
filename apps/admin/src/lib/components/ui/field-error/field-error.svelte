<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn } from "#lib/utils.js";

	let { class: className, children, ...restProps }: HTMLAttributes<HTMLParagraphElement> = $props();
</script>

<p role="alert" data-slot="field-error" class={cn("text-xs text-destructive", className)} {...restProps}>
	{@render children?.()}
</p>
