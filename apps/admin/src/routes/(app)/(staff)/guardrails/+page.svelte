<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import GuardrailsCard from "#lib/components/guardrails/guardrails-card.svelte";

	const content = useIntlayer("guardrails");
</script>

<div>
	<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
	<p class="mt-1 text-sm text-muted-foreground">{$content.subtitle.value}</p>
</div>

<div class="max-w-3xl">
	<GuardrailsCard />
</div>
