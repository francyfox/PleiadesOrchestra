<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { authActions } from "#lib/actions.js";
	import {
		authErrorText,
		useAuthForm,
	} from "#lib/components/auth/auth-form.svelte.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";

	const content = useIntlayer("auth");
	const form = useAuthForm(authActions.userLogin, () =>
		goto("/", { refreshAll: true }),
	);
	const error = $derived(
		form.failure ? authErrorText($content.errors, form.failure) : null,
	);
	// The verification mail link lands here with ?verified=1|0.
	const verified = $derived(page.url.searchParams.get("verified"));
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.userLogin.title.value}</Card.Title>
		<Card.Description>{$content.userLogin.subtitle.value}</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		{#if verified === "1"}
			<p class="text-sm text-emerald-700 dark:text-emerald-400">{$content.userLogin.verified.value}</p>
		{:else if verified === "0"}
			<p class="text-sm text-destructive">{$content.userLogin.notVerified.value}</p>
		{/if}
		<form onsubmit={form.submit} class="grid gap-4">
			<FormField id="email" label={$content.fields.email.value} type="email" autocomplete="email" required />
			<FormField id="password" label={$content.fields.password.value} type="password" autocomplete="current-password" required />
			{#if error}
				<p class="text-sm text-destructive">{error}</p>
			{/if}
			<Button type="submit" class="w-full" disabled={form.pending}>{$content.userLogin.submit.value}</Button>
		</form>
		<div class="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
			<a href="/user/register" class="underline-offset-4 hover:underline">{$content.userLogin.register.value}</a>
			<a href="/user/forgot" class="underline-offset-4 hover:underline">{$content.userLogin.forgot.value}</a>
		</div>
		<a href="/login" class="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">{$content.userLogin.staff.value}</a>
	</Card.Content>
</Card.Root>
