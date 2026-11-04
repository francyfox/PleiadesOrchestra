<script lang="ts">
	import { BalanceAdjustInput, ManualPlanInput } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { accountActions } from "#lib/actions.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { useActionEnhance } from "#lib/components/use-action-enhance.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";

	/** Staff: change a customer's TR balance and grant/end a plan outside Polar. */
	let { userId }: { userId: string } = $props();

	const content = useIntlayer("billing");
	const errorText = useFieldErrorText();
	const balance = useActionEnhance({
		run: accountActions.adjustBalance,
		schema: BalanceAdjustInput,
		successText: () => $content.staff.balanceDone.value,
	});
	const plan = useActionEnhance({
		run: accountActions.setPlan,
		schema: ManualPlanInput,
		successText: () => $content.staff.planDone.value,
	});
	const balanceErrors = balance.errors;
	const planErrors = plan.errors;
</script>

<Card.Root>
	<Card.Header><Card.Title>{$content.staff.corrections.value}</Card.Title></Card.Header>
	<Card.Content class="grid gap-4">
		<form use:balance novalidate class="flex flex-wrap items-end gap-3">
			<input type="hidden" name="id" value={userId} />
			<FormField id="amountUsd" label={$content.staff.amount.value} type="number" step={0.01} required error={$errorText($balanceErrors?.amountUsd)} />
			<Button type="submit">{$content.staff.apply.value}</Button>
		</form>
		<form use:plan novalidate class="flex flex-wrap items-end gap-3">
			<input type="hidden" name="id" value={userId} />
			<FormField id="days" label={$content.staff.days.value} type="number" step={1} min={0} value={30} required error={$errorText($planErrors?.days)} />
			<Button type="submit">{$content.staff.apply.value}</Button>
		</form>
		<p class="text-xs text-muted-foreground">{$content.staff.planNote.value}</p>
	</Card.Content>
</Card.Root>
