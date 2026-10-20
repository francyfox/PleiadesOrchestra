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

	const content = useIntlayer("auth");
	const form = useAuthForm(authActions.forgot);
	const error = $derived(
		form.failure ? authErrorText($content.errors, form.failure) : null,
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.forgot.title.value}</Card.Title>
		<Card.Description>{$content.forgot.subtitle.value}</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		{#if form.done}
			<p class="text-sm">{$content.forgot.sent({ email: form.email })}</p>
		{:else}
			<form onsubmit={form.submit} class="grid gap-4">
				<FormField id="email" label={$content.fields.email.value} type="email" autocomplete="email" required />
				{#if error}
					<p class="text-sm text-destructive">{error}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={form.pending}>{$content.forgot.submit.value}</Button>
			</form>
		{/if}
		<a href="/user/login" class="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">{$content.forgot.back.value}</a>
	</Card.Content>
</Card.Root>
