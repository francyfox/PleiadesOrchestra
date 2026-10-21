<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { AccountBilling } from "#lib/api-types.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import OrdersTable from "./orders-table.svelte";
	import SpendTable from "./spend-table.svelte";

	/** What the user (Billing page) and staff (a customer's dialog) both read: standing, plan, TR, orders, spend. */
	let { billing }: { billing: AccountBilling } = $props();

	const content = useIntlayer("billing");
	const plans = useIntlayer("plans");
	const format = useFormat();
</script>

<Card.Root>
	<Card.Header><Card.Title>{$content.summary.title.value}</Card.Title></Card.Header>
	<Card.Content class="grid gap-3 text-sm sm:grid-cols-2">
		<div>
			<div class="text-muted-foreground">{$content.summary.plan.value}</div>
			<div class="font-medium">
				{billing.subscription?.plan ?? $content.summary.noPlan.value}
				{#if billing.subscription}
					<Badge variant="outline" class="ml-1">{$plans.status[billing.subscription.status].value}</Badge>
				{/if}
			</div>
		</div>
		<div>
			<div class="text-muted-foreground">{$content.summary.expires.value}</div>
			<div class="font-medium">{$format.date(billing.subscription?.currentPeriodEnd)}</div>
		</div>
		<div>
			<div class="text-muted-foreground">{$content.summary.balance.value}</div>
			<div class="font-medium">
				{$format.tr(billing.balanceUsd)}
				{#if billing.balanceUsd < 0}
					<Badge variant="destructive" class="ml-1">{$content.summary.overdraft.value}</Badge>
				{/if}
			</div>
		</div>
		<div>
			<div class="text-muted-foreground">{$content.summary.channels.value}</div>
			<div class="font-medium">
				{#if billing.standing.ok}
					<Badge variant="outline">{$content.summary.ok.value}</Badge>
				{:else}
					<Badge variant="destructive">{$content.summary.paused.value}</Badge>
					{$content.reasons[billing.standing.reason].value}
				{/if}
			</div>
		</div>
	</Card.Content>
</Card.Root>

<h2 class="text-lg font-medium">{$content.orders.title.value}</h2>
<OrdersTable orders={billing.orders} />

<h2 class="text-lg font-medium">{$content.spend.title.value}</h2>
<SpendTable spend={billing.spend} />
