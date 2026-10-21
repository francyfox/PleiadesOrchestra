<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import * as Card from "#lib/components/ui/card/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";

	/** Staff-only money of the dashboard period, USD (`null` = prices unknown). */
	let {
		finance,
	}: {
		finance: {
			modelSpendUsd: number | null;
			revenueUsd: number;
			lossesUsd: number;
			netProfitUsd: number | null;
			ordersCount: number;
		};
	} = $props();

	const content = useIntlayer("dashboard");
	const format = useFormat();

	const tiles = $derived([
		{ label: $content.finance.modelSpend.value, value: finance.modelSpendUsd },
		{ label: $content.finance.revenue.value, value: finance.revenueUsd },
		{ label: $content.finance.losses.value, value: finance.lossesUsd },
		{ label: $content.finance.netProfit.value, value: finance.netProfitUsd },
	]);
</script>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
	{#each tiles as tile (tile.label)}
		<Card.Root>
			<Card.Header>
				<Card.Description>{tile.label}</Card.Description>
				<Card.Title class={["text-2xl", tile.value !== null && tile.value < 0 && "text-destructive"]}>
					{$format.usd(tile.value)}
				</Card.Title>
			</Card.Header>
		</Card.Root>
	{/each}
</div>
<p class="text-xs text-muted-foreground">{$content.finance.note({ orders: finance.ordersCount })}</p>
