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
	import { page } from "$app/state";

	const content = useIntlayer("auth");
	const form = useAuthForm(authActions.reset);
	const error = $derived(
		form.failure ? authErrorText($content.errors, form.failure) : null,
	);
	// The reset mail links here with ?token=...
	const token = $derived(page.url.searchParams.get("token") ?? "");
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.reset.title.value}</Card.Title>
	</Card.Header>
	<Card.Content class="grid gap-4">
		{#if form.done}
			<p class="text-sm">{$content.reset.done.value}</p>
		{:else if !token}
			<p class="text-sm text-destructive">{$content.reset.noToken.value}</p>
		{:else}
			<form onsubmit={form.submit} class="grid gap-4">
				<input type="hidden" name="token" value={token} />
				<FormField id="password" label={$content.fields.newPassword.value} type="password" autocomplete="new-password" minlength={12} required />
				{#if error}
					<p class="text-sm text-destructive">{error}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={form.pending}>{$content.reset.submit.value}</Button>
			</form>
		{/if}
		<a href="/user/login" class="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">{$content.forgot.back.value}</a>
	</Card.Content>
</Card.Root>
