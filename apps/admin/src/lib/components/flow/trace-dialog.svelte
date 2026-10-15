<script lang="ts">
	import DownloadIcon from "@lucide/svelte/icons/download";
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import CopyButton from "#lib/components/copy-button.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { queries } from "#lib/query/queries.js";
	import { traceFileName, traceText } from "#lib/trace-json.js";

	/** The request's WebMCP trace (Model Context Tool Inspector format) as JSON, to copy or save. Built only while open. */
	let { id, open = $bindable(false) }: { id: string; open?: boolean } =
		$props();

	const content = useIntlayer("flow");

	const query = createQuery(() => ({
		...queries.requestTrace(id),
		enabled: open,
	}));
	const text = $derived(query.data ? traceText(query.data) : "");

	function download() {
		const url = URL.createObjectURL(
			new Blob([text], { type: "application/json" }),
		);
		const link = document.createElement("a");
		link.href = url;
		link.download = traceFileName(id);
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="w-full max-w-[min(56rem,calc(100vw-2rem))]">
		<Dialog.Header>
			<Dialog.Title>{$content.trace.title.value}</Dialog.Title>
			<Dialog.Description>{$content.trace.description.value}</Dialog.Description>
		</Dialog.Header>

		{#if query.isError}
			<p class="text-sm text-destructive">{$content.trace.failed.value}</p>
		{:else if !query.data}
			<p class="text-sm text-muted-foreground">{$content.trace.loading.value}</p>
		{:else}
			<div class="relative grid">
				<pre class="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 pr-10 font-mono text-xs"><code>{text}</code></pre>
				<div class="absolute top-1.5 right-1.5">
					<CopyButton value={text} />
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" size="sm" onclick={download}>
					<DownloadIcon />
					{$content.trace.download.value}
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
