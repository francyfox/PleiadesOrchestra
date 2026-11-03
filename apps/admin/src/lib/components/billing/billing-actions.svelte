<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { billingActions } from "#lib/actions.js";
	import type { AccountBilling } from "#lib/api-types.js";
	import ConfirmDialog from "#lib/components/confirm-dialog.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { useBillingEnhance } from "./use-billing-enhance";

	/** Cancel is offered only for a running plan (`canceling` is already set, `ended` has nothing to stop). */
	let { subscription }: { subscription: AccountBilling["subscription"] } =
		$props();

	const content = useIntlayer("billing");

	// Polar being unconfigured only shows on the first checkout/portal call (503); then the buttons stay off.
	let unavailable = $state(false);
	const markUnavailable = () => (unavailable = true);
	const subscribe = useBillingEnhance(
		billingActions.subscribe,
		markUnavailable,
	);
	const manage = useBillingEnhance(billingActions.portal, markUnavailable);
	let cancelOpen = $state(false);
	const cancel = useBillingEnhance(billingActions.cancel, markUnavailable, {
		onSuccess: () => (cancelOpen = false),
		successText: () => $content.cancel.done.value,
	});
	const cancellable = $derived(
		subscription?.status === "active" || subscription?.status === "past_due",
	);
</script>

<Card.Root>
	<Card.Header><Card.Title>{$content.actions.title.value}</Card.Title></Card.Header>
	<Card.Content class="grid gap-4">
		{#if unavailable}
			<p class="text-sm text-muted-foreground">{$content.unavailable.value}</p>
		{/if}
		<div class="flex flex-wrap items-end gap-6">
			<div class="grid gap-1">
				<p class="text-3xl font-semibold">$20 <span class="text-sm font-normal text-muted-foreground">{$content.actions.perMonth.value}</span></p>
				<p class="text-sm text-muted-foreground">{$content.actions.topsUp.value}</p>
			</div>
			<form use:subscribe>
				<Button type="submit" disabled={unavailable}>{$content.actions.subscribe.value}</Button>
			</form>
			<form use:manage>
				<Button type="submit" variant="outline" disabled={unavailable}>{$content.actions.manage.value}</Button>
			</form>
			{#if cancellable}
				<Button variant="destructive" disabled={unavailable} onclick={() => (cancelOpen = true)}>{$content.cancel.action.value}</Button>
			{/if}
		</div>
	</Card.Content>
</Card.Root>

<ConfirmDialog
	bind:open={cancelOpen}
	title={$content.cancel.title.value}
	description={$content.cancel.description.value}
	submitLabel={$content.cancel.action.value}
	submitted={cancel}
/>
