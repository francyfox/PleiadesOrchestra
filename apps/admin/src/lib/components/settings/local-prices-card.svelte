<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import * as Card from "#lib/components/ui/card/index.js";
	import { queries } from "#lib/query/queries.js";
	import LocalPriceForm from "./local-price-form.svelte";

	/** Staff only: the `/preferences` page. */
	const prices = createQuery(() => queries.localPrices());
	const content = useIntlayer("settings");
</script>

{#if prices.data}
	<Card.Root>
		<Card.Header><Card.Title>{$content.localPrices.title.value}</Card.Title></Card.Header>
		<Card.Content class="grid gap-4">
			{#each prices.data.items as price (price.model)}
				<LocalPriceForm {price} />
			{/each}
			<LocalPriceForm />
			<p class="text-xs text-muted-foreground">{$content.localPrices.note.value}</p>
		</Card.Content>
	</Card.Root>
{/if}
