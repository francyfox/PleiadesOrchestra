<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { CreateChannelForm } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { channelActions, channelOverrides } from "#lib/actions.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { Textarea } from "#lib/components/ui/textarea/index.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";
	import AccessModeSelect from "./access-mode-select.svelte";
	import { useChannelEnhance } from "./use-channel-enhance";

	/** The "+ Add" button of the channels page and the dialog with the new-channel form. */
	const content = useIntlayer("channels");
	const common = useIntlayer("common");

	let open = $state(false);
	const submitted = useChannelEnhance(
		channelActions.create,
		undefined,
		() => {
			open = false;
		},
		CreateChannelForm,
		channelOverrides,
	);
	const errors = submitted.errors;
	const errorText = useFieldErrorText();
</script>

<Button onclick={() => (open = true)}>
	<PlusIcon class="size-4" />
	{$common.add.value}
</Button>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{$content.create.title.value}</Dialog.Title>
			<Dialog.Description>{$content.create.hint.value}</Dialog.Description>
		</Dialog.Header>
		<form use:submitted novalidate class="grid gap-3">
			<FormField id="slug" label="Slug" placeholder="my-site" required error={$errorText($errors?.slug)} />
			<FormField id="name" label={$content.create.name.value} required error={$errorText($errors?.name)} />
			<div class="grid gap-2">
				<Label for="accessMode">{$content.columns.access.value}</Label>
				<AccessModeSelect id="accessMode" />
			</div>
			<FormField
				id="catalogLanguage"
				label={$content.catalogLanguage.value}
				placeholder="en"
				value="en"
				error={$errorText($errors?.catalogLanguage)}
			/>
			<p class="-mt-2 text-xs text-muted-foreground">{$content.catalogLanguageHint.value}</p>
			<div class="grid gap-2">
				<Label for="allowedOrigins">{$content.create.origins.value}</Label>
				<Textarea id="allowedOrigins" name="allowedOrigins" placeholder="https://example.com" />
			</div>
			<Dialog.Footer>
				<Button variant="ghost" type="button" onclick={() => (open = false)}>{$common.cancel.value}</Button>
				<Button type="submit">{$common.create.value}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
