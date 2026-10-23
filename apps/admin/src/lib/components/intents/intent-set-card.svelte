<script lang="ts">
	import GitBranchIcon from "@lucide/svelte/icons/git-branch";
	import { Button } from "#lib/components/ui/button/index.js";

	/** One intent set: its name (the id), what it does, and a link to the file that defines it. */
	let {
		name,
		description,
		codeHref,
		codeLabel,
	}: {
		name: string;
		description: string;
		codeHref: string;
		codeLabel: string;
	} = $props();
</script>

<article class="grid gap-2 rounded-lg border p-3">
	<h3 class="font-mono text-sm font-semibold">{name}</h3>
	<p class="text-sm text-muted-foreground">{description}</p>
	<Button variant="outline" size="sm" class="w-fit" href={codeHref} target="_blank" rel="noreferrer">
		<GitBranchIcon class="size-4" />
		{codeLabel}
	</Button>
</article>
