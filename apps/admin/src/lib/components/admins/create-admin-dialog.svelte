<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { useIntlayer } from "svelte-intlayer";
	import { adminActions } from "$lib/actions";
	import FormField from "$lib/components/form-field.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { useAdminEnhance } from "./use-admin-enhance";

	/** The "+ Add" button of the admins page and the dialog with the new-account form. */
	const content = useIntlayer("admins");
	const common = useIntlayer("common");

	let open = $state(false);
	const submitted = useAdminEnhance(adminActions.create, undefined, () => {
		open = false;
	});
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
		<form use:submitted class="grid gap-3">
			<FormField id="new-name" name="name" label={$content.columns.name.value} />
			<FormField id="new-email" name="email" label={$content.columns.email.value} type="email" required />
			<FormField
				id="new-password"
				name="password"
				label={$content.create.tempPassword.value}
				type="password"
				minlength={8}
				autocomplete="new-password"
				required
			/>
			<Dialog.Footer>
				<Button variant="ghost" type="button" onclick={() => (open = false)}>{$common.cancel.value}</Button>
				<Button type="submit">{$common.create.value}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
