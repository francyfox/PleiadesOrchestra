<script lang="ts">
	import { TokenLoginForm } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { authActions } from "#lib/actions.js";
	import {
		authErrorText,
		useAuthForm,
	} from "#lib/components/auth/auth-form.svelte.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";
	import { goto } from "$app/navigation";

	let { data } = $props();

	const content = useIntlayer("auth");
	// Reloads the session in the root layout, which lets us past /login.
	const form = useAuthForm(
		authActions.tokenLogin,
		() => goto("/", { refreshAll: true }),
		{ schema: TokenLoginForm },
	);
	const errorText = useFieldErrorText();
	const error = $derived(
		form.failure ? authErrorText($content.errors, form.failure) : null,
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.login.title.value}</Card.Title>
		<Card.Description>{$content.login.subtitle.value}</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		{#if data.setupRequired}
			<p class="rounded-md border p-3 font-mono text-xs break-words">{$content.login.setup.value}</p>
		{/if}
		<form onsubmit={form.submit} oninput={form.clear} novalidate class="grid gap-4">
			<FormField id="token" label={$content.fields.token.value} type="password" autocomplete="off" required error={$errorText(form.errors?.token)} />
			{#if error}
				<p class="text-sm text-destructive">{error}</p>
			{/if}
			<Button type="submit" class="w-full" disabled={form.pending}>{$content.login.submit.value}</Button>
		</form>
		<a href="/user/login" class="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">{$content.login.customer.value}</a>
	</Card.Content>
</Card.Root>
