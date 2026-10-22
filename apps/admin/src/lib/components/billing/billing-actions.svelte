<script lang="ts">
	import { TopUpForm } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { billingActions } from "#lib/actions.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { FieldError } from "#lib/components/ui/field-error/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";
	import { useBillingEnhance } from "./use-billing-enhance";

	const content = useIntlayer("billing");

	// Polar being unconfigured only shows on the first checkout/portal call (503); then the buttons stay off.
	let unavailable = $state(false);
	const markUnavailable = () => (unavailable = true);
	const subscribe = useBillingEnhance(
		billingActions.subscribe,
		markUnavailable,
	);
	const topUp = useBillingEnhance(billingActions.topUp, markUnavailable, {
		schema: TopUpForm,
	});
	const errors = topUp.errors;
	const errorText = useFieldErrorText();
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
				<Button type="submit" disabled={unavailable}>{$content.actions.subscribe.value}</Button>
			</form>
			<form use:topUp novalidate class="flex flex-wrap items-end gap-2">
				<input type="hidden" name="kind" value="credits" />
				<div class="grid gap-1.5">
					<Label for="amountUsd" required>{$content.actions.amount.value}</Label>
					<Input id="amountUsd" name="amountUsd" type="number" step="1" value="10" required aria-invalid={!!$errors?.amountUsd} aria-describedby={$errors?.amountUsd ? "amountUsd-error" : undefined} class="w-40" />
					{#if $errors?.amountUsd}<FieldError id="amountUsd-error">{$errorText($errors.amountUsd)}</FieldError>{/if}
				</div>
				<Button type="submit" disabled={unavailable}>{$content.actions.topUp.value}</Button>
			</form>
			<form use:manage>
				<Button type="submit" variant="outline" disabled={unavailable}>{$content.actions.manage.value}</Button>
			</form>
		</div>
	</Card.Content>
</Card.Root>
