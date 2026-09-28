<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import CodeBlock from "$lib/components/code-block.svelte";
	import { FAQ_CODE } from "./faq-code";
	import type { FaqId } from "./faq-items";

	/** The question and answer chosen in the list, with its code sample if it has one. */
	let { id }: { id: FaqId | undefined } = $props();

	const content = useIntlayer("faq");
</script>

<article class="grid min-h-[300px] content-start gap-3 rounded-md border p-4" aria-live="polite">
	{#if id}
		<h3 class="font-medium">{$content.items[id].q.value}</h3>
		<p class="text-sm whitespace-pre-line text-muted-foreground">{$content.items[id].a.value}</p>
		{#if FAQ_CODE[id]}
			<CodeBlock code={FAQ_CODE[id].code} lang={FAQ_CODE[id].lang} />
		{/if}
	{:else}
		<p class="text-sm text-muted-foreground">{$content.search.empty.value}</p>
	{/if}
</article>
