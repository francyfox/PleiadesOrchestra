<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { providerActions } from "#lib/actions.js";
	import type { Provider, ProviderModel } from "#lib/api-types.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { Textarea } from "#lib/components/ui/textarea/index.js";
	import { useModelsEnhance } from "./use-models-enhance";

	/** Adds a model to a provider, or edits one (`editing` set; provider and id stay). */
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
	);
	const model = $derived(editing?.model);

	const selectClass =
		"h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto">
		<Dialog.Header><Dialog.Title>{$content.form.modelTitle.value}</Dialog.Title></Dialog.Header>
		{#key `${editing?.provider}\t${model?.id}`}
			<form use:submitted class="grid gap-3">
				{#if editing && model}
					<input type="hidden" name="provider" value={editing.provider} />
					<input type="hidden" name="id" value={model.id} />
					<p class="font-mono text-sm">{editing.provider} · {model.id}</p>
				{:else}
					<div class="grid gap-2">
						<Label for="model-provider">{$content.form.provider.value}</Label>
						<select id="model-provider" name="provider" required class={selectClass}>
							{#each providers as p (p.id)}
								<option value={p.id}>{p.name}</option>
							{/each}
						</select>
					</div>
					<FormField id="model-id" name="id" label={$content.form.modelId.value} placeholder="google/gemini-2.5-flash" required />
					<p class="-mt-2 text-xs text-muted-foreground">{$content.form.modelIdHint.value}</p>
				{/if}
				<FormField id="model-name" name="name" label={$content.form.name.value} value={model?.name ?? ""} />
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
					/>
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
						value={model && Object.keys(model.extraBody).length ? JSON.stringify(model.extraBody) : ""}
					/>
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
