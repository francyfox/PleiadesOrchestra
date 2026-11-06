<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { FinanceRates } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { financeActions } from "#lib/actions.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { useActionEnhance } from "#lib/components/use-action-enhance.js";
	import { creditPreview } from "#lib/finance-preview.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";
	import { queries } from "#lib/query/queries.js";

	/** Staff only: the `/preferences` page. */
	const rates = createQuery(() => queries.financeRates());
	const content = useIntlayer("settings");
	const common = useIntlayer("common");
	const errorText = useFieldErrorText();
	const save = useActionEnhance({
		run: financeActions.save,
		schema: FinanceRates,
		successText: () => $content.financeRates.saved.value,
	});
	const errors = save.errors;
	const fields = [
		["feeFixedUsd", 0.01],
		["feePercent", 0.1],
		["payoutPercent", 0.1],
		["taxPercent", 0.1],
		["conversionPercent", 0.1],
		["marginPercent", 0.1],
	] as const;
</script>

{#if rates.data}
	<Card.Root>
		<Card.Header><Card.Title>{$content.financeRates.title.value}</Card.Title></Card.Header>
		<Card.Content>
			<form use:save novalidate class="grid max-w-md gap-3">
				{#each fields as [name, step]}
					<FormField id={name} label={$content.financeRates[name].value} type="number" {step} min={0} value={rates.data[name]} required error={$errorText($errors?.[name])} />
				{/each}
				<div class="grid gap-2">
					<label for="taxBase" class="text-sm font-medium">{$content.financeRates.taxBase.value}</label>
					<select
						id="taxBase"
						name="taxBase"
						value={rates.data.taxBase}
						class="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{#each ["payout", "revenue"] as const as base}
							<option value={base}>{$content.financeRates.base[base].value}</option>
						{/each}
					</select>
				</div>
				<table class="text-sm">
					<caption class="pb-1 text-left text-xs text-muted-foreground">{$content.financeRates.preview.value}</caption>
					<tbody>
						{#each creditPreview(rates.data) as row}
							<tr><td>${row.paid}</td><td>{row.credited.toFixed(2)} TR</td><td>${row.net.toFixed(2)}</td></tr>
						{/each}
					</tbody>
				</table>
				<p class="text-xs text-muted-foreground">{$content.financeRates.note.value}</p>
				<div><Button type="submit">{$common.save.value}</Button></div>
			</form>
		</Card.Content>
	</Card.Root>
{/if}
