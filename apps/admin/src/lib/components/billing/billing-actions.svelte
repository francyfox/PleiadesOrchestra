<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { billingActions } from "#lib/actions.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { useBillingEnhance } from "./use-billing-enhance";

	const content = useIntlayer("billing");

	// Polar being unconfigured only shows on the first checkout/portal call (503); then the buttons stay off.
	let unavailable = $state(false);
	const markUnavailable = () => (unavailable = true);
	const subscribe = useBillingEnhance(
		billingActions.subscribe,
		markUnavailable,
	);
	const manage = useBillingEnhance(billingActions.portal, markUnavailable);
</script>

<Card.Root>
	<Card.Header><Card.Title>{$content.actions.title.value}</Card.Title></Card.Header>
	<Card.Content class="grid gap-4">
		{#if unavailable}
			<p class="text-sm text-muted-foreground">{$content.unavailable.value}</p>
		{/if}
		<div class="flex flex-wrap items-end gap-6">
			<p class="text-3xl font-semibold">$20 <span class="text-sm font-normal text-muted-foreground">{$content.actions.perMonth.value}</span></p>
			<form use:subscribe>
				<Button type="submit" disabled={unavailable}>{$content.actions.subscribe.value}</Button>
			</form>
			<form use:manage>
				<Button type="submit" variant="outline" disabled={unavailable}>{$content.actions.manage.value}</Button>
			</form>
		</div>
	</Card.Content>
</Card.Root>
