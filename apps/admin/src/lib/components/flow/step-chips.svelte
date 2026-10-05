<script lang="ts">
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import type { RequestStatus } from "$lib/api-types";
	import { Badge } from "$lib/components/ui/badge/index.js";

	/**
	 * A request's steps as chips in the order they ran. The last one is
	 * coloured by how the request stands: in progress, failed, or just done.
	 */
	let { steps, status }: { steps: string[]; status: RequestStatus } = $props();

	const lastVariant = $derived(
		status === "failed" || status === "abandoned"
			? "destructive"
			: status === "running" || status === "waiting"
				? "default"
				: "secondary",
	);
</script>

{#if steps.length === 0}
	—
{:else}
	<span class="inline-flex items-center gap-1">
		{#each steps as step, index (index)}
			{#if index > 0}<ChevronRightIcon class="size-3 shrink-0 text-muted-foreground" />{/if}
			<Badge variant={index === steps.length - 1 ? lastVariant : "secondary"} class="font-mono text-xs">
				{step}
			</Badge>
		{/each}
	</span>
{/if}
