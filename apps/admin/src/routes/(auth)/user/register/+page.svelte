<script lang="ts">
	import { UserRegisterForm } from "admin-api/forms";
	import { useIntlayer, useLocale } from "svelte-intlayer";
	import { authActions, passwordAsTyped } from "#lib/actions.js";
	import {
		authErrorText,
		useAuthForm,
	} from "#lib/components/auth/auth-form.svelte.js";
	import ResendMail from "#lib/components/auth/resend-mail.svelte";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";

	const content = useIntlayer("auth");
	const { locale } = useLocale();
	const form = useAuthForm(authActions.userRegister, undefined, {
		schema: UserRegisterForm,
		overrides: passwordAsTyped,
	});
	const errorText = useFieldErrorText();
	const error = $derived(
		form.failure ? authErrorText($content.errors, form.failure) : null,
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.register.title.value}</Card.Title>
		<Card.Description>{$content.register.subtitle.value}</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		{#if form.done}
			<p class="text-sm">{$content.register.sent({ email: form.email })}</p>
			<ResendMail email={form.email} />
		{:else}
			<form onsubmit={form.submit} oninput={form.clear} novalidate class="grid gap-4">
				<input type="hidden" name="locale" value={$locale} />
				<FormField id="name" label={$content.fields.name.value} autocomplete="name" />
				<FormField id="email" label={$content.fields.email.value} type="email" autocomplete="email" required error={$errorText(form.errors?.email)} />
				<FormField id="password" label={$content.fields.password.value} type="password" autocomplete="new-password" required error={$errorText(form.errors?.password)} />
				{#if error}
					<p class="text-sm text-destructive">{error}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={form.pending}>{$content.register.submit.value}</Button>
			</form>
		{/if}
		<a href="/user/login" class="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">{$content.register.hasAccount.value}</a>
	</Card.Content>
</Card.Root>
