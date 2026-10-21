<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { billingActions } from "#lib/actions.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { useBillingEnhance } from "./use-billing-enhance";

	const content = useIntlayer("billing");

	// Polar being unconfigured only shows on the first checkout/portal call (503); then the buttons stay off.
	let unavailable = $state(false);
	const markUnavailable = () => (unavailable = true);
	const subscribe = useBillingEnhance(billingActions.checkout, markUnavailable);
	const topUp = useBillingEnhance(billingActions.checkout, markUnavailable);
	const manage = useBillingEnhance(billingActions.portal, markUnavailable);
</script>

<Card.Root>
	<Card.Header><Card.Title>{$content.actions.title.value}</Card.Title></Card.Header>
	<Card.Content class="grid gap-4">
		{#if unavailable}
			<p class="text-sm text-muted-foreground">{$content.unavailable.value}</p>
		{/if}
		<div class="flex flex-wrap items-end gap-6">
			<form use:subscribe>
				<input type="hidden" name="kind" value="plan" />
				<Button type="submit" disabled={unavailable}>{$content.actions.subscribe.value}</Button>
			</form>
			<form use:topUp class="flex flex-wrap items-end gap-2">
				<input type="hidden" name="kind" value="credits" />
				<div class="grid gap-1.5">
					<Label for="amountUsd">{$content.actions.amount.value}</Label>
					<Input id="amountUsd" name="amountUsd" type="number" min="1" max="10000" step="1" value="10" required class="w-40" />
				</div>
				<Button type="submit" disabled={unavailable}>{$content.actions.topUp.value}</Button>
			</form>
			<form use:manage>
				<Button type="submit" variant="outline" disabled={unavailable}>{$content.actions.manage.value}</Button>
			</form>
		</div>
	</Card.Content>
</Card.Root>
