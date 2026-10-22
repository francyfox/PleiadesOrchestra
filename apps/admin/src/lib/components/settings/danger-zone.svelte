<script lang="ts">
	import { DeleteMeInput } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { meActions } from "#lib/actions.js";
	import type { Me } from "#lib/api-types.js";
	import ConfirmDialog from "#lib/components/confirm-dialog.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { FieldError } from "#lib/components/ui/field-error/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { confirmEmailMatches } from "#lib/confirm-email.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";
	import { queryClient } from "#lib/query/client.js";
	import { useSettingsEnhance } from "./use-settings-enhance";

	let { me }: { me: Me } = $props();

	const content = useIntlayer("settings");

	let open = $state(false);
	let typed = $state("");
	const errorText = useFieldErrorText();
	const remove = useSettingsEnhance(meActions.remove, {
		schema: DeleteMeInput,
		quietSuccess: () => true,
		// The sessions died with the account: a full load drops every trace of it.
		onSuccess: () => {
			queryClient.clear();
			window.location.assign("/user/login");
		},
		onSettled: () => (typed = ""),
	});
	const errors = remove.errors;
</script>

<Card.Root class="border-destructive/50">
	<Card.Header><Card.Title class="text-destructive">{$content.danger.title.value}</Card.Title></Card.Header>
	<Card.Content class="grid gap-3">
		<p class="text-sm text-muted-foreground">{$content.danger.body.value}</p>
		<div><Button variant="destructive" onclick={() => (open = true)}>{$content.danger.action.value}</Button></div>
	</Card.Content>
</Card.Root>

<ConfirmDialog
	bind:open
	title={$content.danger.dialogTitle.value}
	description={$content.danger.body.value}
	submitLabel={$content.danger.action.value}
	submitted={remove}
	canSubmit={confirmEmailMatches(typed, me.email)}
>
	{#snippet fields()}
		<div class="grid gap-2">
			<Label for="confirmEmail" required>{$content.danger.confirmLabel({ email: me.email })}</Label>
			<Input id="confirmEmail" name="confirmEmail" type="email" autocomplete="off" bind:value={typed} aria-invalid={!!$errors?.confirmEmail} />
			{#if $errors?.confirmEmail}<FieldError>{$errorText($errors.confirmEmail)}</FieldError>{/if}
		</div>
	{/snippet}
</ConfirmDialog>
