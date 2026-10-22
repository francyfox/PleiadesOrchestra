<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { CreateAdminInput } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { adminActions, adminOverrides } from "#lib/actions.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";
	import { useAdminEnhance } from "./use-admin-enhance";

	/** The "+ Add" button of the admins page and the dialog with the new-account form. */
	let { onIssued }: { onIssued: (email: string, token: string) => void } =
		$props();

	const content = useIntlayer("admins");
	const common = useIntlayer("common");

	let open = $state(false);
	const submitted = useAdminEnhance(
		adminActions.create,
		undefined,
		(data) => {
			open = false;
			onIssued(String(data.email ?? ""), String(data.token ?? ""));
		},
		{ schema: CreateAdminInput, overrides: adminOverrides },
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
			<FormField id="new-name" name="name" label={$content.columns.name.value} />
			<FormField id="new-email" name="email" label={$content.columns.email.value} type="email" required error={$errorText($errors?.email)} />
			<Dialog.Footer>
				<Button variant="ghost" type="button" onclick={() => (open = false)}>{$common.cancel.value}</Button>
				<Button type="submit">{$common.create.value}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
