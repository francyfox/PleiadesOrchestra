<script lang="ts">
	import type { Snippet } from "svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import type { LoadLevel } from "$lib/system/load-level";
	import { levelBadgeClass, levelDotClass } from "../level-styles";

	/** Green / yellow / red badge; `label` names the level for screen readers and the tooltip, so colour isn't the only signal. */
	let {
		level,
		label,
		title,
		children,
	}: {
		level: LoadLevel;
		label: string;
		title?: string;
		children: Snippet;
	} = $props();
</script>

<Badge variant="ghost" class="gap-1.5 tabular-nums {levelBadgeClass[level]}" title={title ?? label}>
	<span class="size-2 shrink-0 rounded-full {levelDotClass[level]}" aria-hidden="true"></span>
	{@render children()}
	<span class="sr-only">— {label}</span>
</Badge>
