<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { enhance } from "$app/forms";
	import type { BulkAction } from "$lib/api-types";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { useBulkEnhance } from "./use-bulk-enhance";

	/** Shown while rows are selected: one action for all of them. */
	let { ids, onDone }: { ids: string[]; onDone: () => void } = $props();

	const content = useIntlayer("users");
	const actions = useIntlayer("user-actions");

	let reason = $state("");
	const submitted = useBulkEnhance(() => {
		reason = "";
		onDone();
	});

	const ACTIONS: BulkAction[] = [
		"whitelist",
		"unwhitelist",
		"block",
		"unblock",
	];
</script>

<form
	method="POST"
	action="?/bulk"
	use:enhance={submitted}
	class="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2"
>
	<span class="text-sm">{$content.bulk.selected({ count: ids.length })}</span>
	{#each ids as id (id)}<input type="hidden" name="ids" value={id} />{/each}
	<Input name="reason" placeholder={$content.bulk.reason.value} bind:value={reason} class="w-64" />
	{#each ACTIONS as action (action)}
		<Button size="sm" type="submit" name="action" value={action} variant={action === "block" ? "destructive" : "outline"}>
			{$actions[action].value}
		</Button>
	{/each}
</form>
