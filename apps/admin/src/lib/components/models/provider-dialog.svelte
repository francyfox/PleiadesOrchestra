<script lang="ts">
	import { ProviderForm } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { providerActions } from "#lib/actions.js";
	import type { Provider } from "#lib/api-types.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";
	import { useModelsEnhance } from "./use-models-enhance";

	/** Adds a provider, or edits one (`provider` set; its id stays). */
	let {
		open = $bindable(false),
		provider = null,
	}: { open?: boolean; provider?: Provider | null } = $props();

	const content = useIntlayer("models");
	const common = useIntlayer("common");
	const submitted = useModelsEnhance(
		providerActions.save,
		() => (open = false),
		ProviderForm,
	);
	const errors = submitted.errors;
	const errorText = useFieldErrorText();
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>{$content.form.providerTitle.value}</Dialog.Title></Dialog.Header>
		{#key provider?.id}
			<form use:submitted novalidate class="grid gap-3">
				{#if provider}
					<input type="hidden" name="id" value={provider.id} />
				{:else}
					<FormField id="provider-id" name="id" label={$content.form.id.value} placeholder="openrouter" required error={$errorText($errors?.id)} />
					<p class="-mt-2 text-xs text-muted-foreground">{$content.form.idHint.value}</p>
				{/if}
				<FormField id="provider-name" name="name" label={$content.form.name.value} value={provider?.name ?? ""} placeholder="OpenRouter" required error={$errorText($errors?.name)} />
				<FormField id="provider-url" name="baseUrl" type="url" label="Base URL" value={provider?.baseUrl ?? ""} placeholder="https://openrouter.ai/api/v1" required error={$errorText($errors?.baseUrl)} />
				<FormField id="provider-decisions-url" name="decisionsUrl" type="url" label={$content.form.decisionsUrl.value} value={provider?.decisionsUrl ?? ""} placeholder="https://openrouter.ai/api/alpha/decisions" error={$errorText($errors?.decisionsUrl)} />
				<p class="-mt-2 text-xs text-muted-foreground">{$content.form.decisionsUrlHint.value}</p>
				<FormField
					id="provider-key"
					name="apiKey"
					type="password"
					autocomplete="off"
					label={$content.form.apiKey.value}
					placeholder={provider?.apiKey || "sk-… / $OPENROUTER_API_KEY"}
				/>
				<p class="-mt-2 text-xs text-muted-foreground">{$content.form.apiKeyHint.value}</p>
				<Dialog.Footer>
					<Button variant="ghost" type="button" onclick={() => (open = false)}>{$common.cancel.value}</Button>
					<Button type="submit">{$common.save.value}</Button>
				</Dialog.Footer>
			</form>
		{/key}
	</Dialog.Content>
</Dialog.Root>
