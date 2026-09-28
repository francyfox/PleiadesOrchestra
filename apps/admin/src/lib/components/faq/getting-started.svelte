<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import CodeBlock from "$lib/components/code-block.svelte";
	import AttributesTable from "./attributes-table.svelte";
	import { CONNECT_EXAMPLE } from "./faq-code";

	const content = useIntlayer("faq");
</script>

<section class="grid gap-3">
	<h2 class="text-lg font-semibold">{$content.start.title.value}</h2>
	<p class="whitespace-pre-line text-sm text-muted-foreground">{$content.start.steps.value}</p>
	<CodeBlock code={CONNECT_EXAMPLE} lang="markup" />

	<h3 class="mt-2 font-medium">{$content.start.attributes.title.value}</h3>
	<AttributesTable />
</section>
