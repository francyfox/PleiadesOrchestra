<script lang="ts">
	import { ProviderModel as ProviderModelSchema } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { providerActions } from "#lib/actions.js";
	import type { Provider, ProviderModel } from "#lib/api-types.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { FieldError } from "#lib/components/ui/field-error/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { SearchMultiSelect } from "#lib/components/ui/search-multi-select/index.js";
	import { Textarea } from "#lib/components/ui/textarea/index.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";
	import { MODEL_TYPE_ICONS } from "#lib/model-type-icons.js";
	import { MODEL_TYPES, typeLabel } from "#lib/model-types.js";
	import { useModelsEnhance } from "./use-models-enhance";

	/** Adds a model to a provider, or edits one (`editing` set; the id and the provider can change, the agents that picked it follow). */
	let {
		open = $bindable(false),
		providers,
		editing = null,
	}: {
		open?: boolean;
		providers: Provider[];
		editing?: { provider: string; model: ProviderModel } | null;
	} = $props();

	const content = useIntlayer("models");
	const common = useIntlayer("common");
	const submitted = useModelsEnhance(
		providerActions.saveModel,
		() => (open = false),
		ProviderModelSchema,
	);
	const errors = submitted.errors;
	const errorText = useFieldErrorText();
	const model = $derived(editing?.model);
	// What the model can do (several for a multimodal one); reset with the dialog's content.
	let types = $state<string[]>(["language"]);
	$effect(() => {
		types = [...(model?.types ?? ["language"])];
	});
	// The multi-select has no input event of its own.
	$effect(() => {
		types;
		submitted.clear("types");
	});
	const typeOptions = MODEL_TYPES.map((type) => ({
		value: type,
		label: typeLabel(type),
		icon: MODEL_TYPE_ICONS[type],
	}));

	const selectClass =
		"h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto">
		<Dialog.Header><Dialog.Title>{$content.form.modelTitle.value}</Dialog.Title></Dialog.Header>
		{#key `${editing?.provider}\t${model?.id}`}
			<form use:submitted novalidate class="grid gap-3">
				<div class="grid gap-2">
					<Label for="model-provider" required>{$content.form.provider.value}</Label>
					<select id="model-provider" name="provider" required value={editing?.provider} class={selectClass}>
						{#each providers as p (p.id)}
							<option value={p.id}>{p.name}</option>
						{/each}
					</select>
				</div>
				{#if editing && model}
					<input type="hidden" name="fromProvider" value={editing.provider} />
					<input type="hidden" name="fromId" value={model.id} />
				{/if}
				<FormField id="model-id" name="id" label={$content.form.modelId.value} value={model?.id ?? ""} placeholder="google/gemini-2.5-flash" required error={$errorText($errors?.id)} />
				<p class="-mt-2 text-xs text-muted-foreground">
					{editing ? $content.form.modelIdEditHint.value : $content.form.modelIdHint.value}
				</p>
				<div class="grid gap-2">
					<Label for="model-types" required>{$content.form.types.value}</Label>
					<SearchMultiSelect
						bind:values={types}
						name="types"
						options={typeOptions}
						ariaLabel={$content.form.types.value}
						searchPlaceholder={$content.form.typesSearch.value}
						emptyText={$content.form.typesEmpty.value}
						clearLabel={$content.form.typesClear.value}
						removeLabel={(label) => $content.form.typesRemove({ label })}
						required
						invalid={!!$errors?.types}
					/>
					{#if $errors?.types}<FieldError>{$errorText($errors.types)}</FieldError>{/if}
				</div>
				<FormField id="model-name" name="name" label={$content.form.name.value} value={model?.name ?? ""} required error={$errorText($errors?.name)} />
				<div class="grid gap-2">
					<Label for="model-temperature">{$content.form.temperature.value}</Label>
					<Input
						id="model-temperature"
						name="temperature"
						type="number"
						step="0.1"
						min="0"
						max="2"
						value={model?.temperature ?? ""}
						placeholder={$content.form.unset.value}
						aria-invalid={!!$errors?.temperature}
					/>
					{#if $errors?.temperature}<FieldError>{$errorText($errors.temperature)}</FieldError>{/if}
				</div>
				<div class="grid gap-2">
					<Label for="model-effort">{$content.form.effort.value}</Label>
					<select id="model-effort" name="reasoningEffort" value={model?.reasoningEffort ?? ""} class={selectClass}>
						<option value="">{$content.form.unset.value}</option>
						<option value="none">none</option>
						<option value="low">low</option>
						<option value="medium">medium</option>
						<option value="high">high</option>
					</select>
				</div>
				<div class="grid gap-2">
					<Label for="model-extra">{$content.form.extraBody.value}</Label>
					<Textarea
						id="model-extra"
						name="extraBody"
						rows={3}
						class="font-mono text-xs"
						aria-invalid={!!$errors?.extraBody}
						value={model && Object.keys(model.extraBody).length ? JSON.stringify(model.extraBody) : ""}
					/>
					{#if $errors?.extraBody}<FieldError>{$errorText($errors.extraBody)}</FieldError>{/if}
					<p class="text-xs text-muted-foreground">{$content.form.extraBodyHint.value}</p>
				</div>
				<Dialog.Footer>
					<Button variant="ghost" type="button" onclick={() => (open = false)}>{$common.cancel.value}</Button>
					<Button type="submit">{$common.save.value}</Button>
				</Dialog.Footer>
			</form>
		{/key}
	</Dialog.Content>
</Dialog.Root>
