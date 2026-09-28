<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import { useIntlayer } from "svelte-intlayer";
	import { toast } from "svelte-sonner";
	import { copyText } from "$lib/clipboard";
	import { Button } from "$lib/components/ui/button/index.js";

	/** Icon-only "copy to clipboard"; flips to a check mark for a moment on success. */
	let { value, label }: { value: string; label?: string } = $props();

	const common = useIntlayer("common");

	let copied = $state(false);

	$effect(() => {
		if (!copied) return;
		const timer = setTimeout(() => {
			copied = false;
		}, 1500);
		return () => clearTimeout(timer);
	});

	async function copy() {
		if (await copyText(value)) copied = true;
		else toast.error($common.copyFailed.value);
	}
</script>

<Button
	variant="ghost"
	size="icon-xs"
	class="text-muted-foreground hover:text-foreground"
	aria-label={label ?? $common.copy.value}
	title={copied ? $common.copied.value : (label ?? $common.copy.value)}
	onclick={copy}
>
	{#if copied}<CheckIcon class="text-emerald-600 dark:text-emerald-400" />{:else}<CopyIcon />{/if}
</Button>
