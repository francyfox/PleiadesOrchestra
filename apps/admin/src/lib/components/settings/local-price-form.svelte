<script lang="ts">
	import { LocalPriceForm } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { localPriceActions } from "#lib/actions.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { useActionEnhance } from "#lib/components/use-action-enhance.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";

	/** One price row; without `price` it is the blank row that adds a model. */
	let {
		price,
	}: {
		price?: {
			model: string;
			inputPerMillionUsd: number;
			outputPerMillionUsd: number;
			cacheReadPerMillionUsd: number | null;
		};
	} = $props();
	const content = useIntlayer("settings");
	const common = useIntlayer("common");
	const errorText = useFieldErrorText();
	const save = useActionEnhance({
		run: localPriceActions.save,
		schema: LocalPriceForm,
		successText: () => $content.localPrices.saved.value,
		resetOnSuccess: !price,
	});
	const errors = save.errors;
</script>

<form use:save novalidate class="grid grid-cols-2 items-end gap-2 sm:grid-cols-5">
	{#if price}
		<input type="hidden" name="model" value={price.model} />
		<span class="break-all text-sm">{price.model}</span>
	{:else}
		<FormField id="model" label={$content.localPrices.model.value} required error={$errorText($errors?.model)} />
	{/if}
	<FormField id={`input-${price?.model ?? ""}`} name="inputPerMillionUsd" label={$content.localPrices.input.value} type="number" step="any" min={0} value={price?.inputPerMillionUsd ?? ""} required error={$errorText($errors?.inputPerMillionUsd)} />
	<FormField id={`output-${price?.model ?? ""}`} name="outputPerMillionUsd" label={$content.localPrices.output.value} type="number" step="any" min={0} value={price?.outputPerMillionUsd ?? ""} required error={$errorText($errors?.outputPerMillionUsd)} />
	<FormField id={`cache-${price?.model ?? ""}`} name="cacheReadPerMillionUsd" label={$content.localPrices.cacheRead.value} type="number" step="any" min={0} value={price?.cacheReadPerMillionUsd ?? ""} error={$errorText($errors?.cacheReadPerMillionUsd)} />
	<div class="flex gap-2">
		<Button type="submit">{$common.save.value}</Button>
		{#if price}
			<Button type="submit" name="op" value="delete" variant="outline">{$content.localPrices.delete.value}</Button>
		{/if}
	</div>
</form>
