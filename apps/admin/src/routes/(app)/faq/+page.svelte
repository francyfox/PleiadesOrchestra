<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import FaqList from "$lib/components/faq/faq-list.svelte";
	import GettingStarted from "$lib/components/faq/getting-started.svelte";

	const content = useIntlayer("faq");
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
<p class="text-sm text-muted-foreground">{$content.subtitle.value}</p>

<GettingStarted />

<section class="grid gap-3">
	<h2 class="text-lg font-semibold">{$content.questionsTitle.value}</h2>
	<FaqList />
</section>
