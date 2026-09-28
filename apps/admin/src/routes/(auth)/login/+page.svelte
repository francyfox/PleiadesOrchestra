<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { goto } from "$app/navigation";
	import { authActions } from "$lib/actions";
	import FormField from "$lib/components/form-field.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";

	const content = useIntlayer("auth");

	let error = $state<"missing_credentials" | "invalid_credentials" | null>(
		null,
	);
	let pending = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (pending) return;
		pending = true;
		error = null;
		const result = await authActions.login(
			new FormData(event.currentTarget as HTMLFormElement),
		);
		pending = false;
		if (!result.ok) {
			// Unknown failures (network) read as a failed sign-in too.
			error =
				result.data.error === "missing_credentials"
					? "missing_credentials"
					: "invalid_credentials";
			return;
		}
		// Reloads the session in the root layout, which lets us past /login.
		await goto("/", { invalidateAll: true });
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.login.title.value}</Card.Title>
		<Card.Description>{$content.login.subtitle.value}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form onsubmit={submit} class="grid gap-4">
			<FormField id="email" label={$content.fields.email.value} type="email" autocomplete="email" required />
			<FormField id="password" label={$content.fields.password.value} type="password" autocomplete="current-password" required />
			{#if error}
				<p class="text-sm text-destructive">{$content.errors[error].value}</p>
			{/if}
			<Button type="submit" class="w-full" disabled={pending}>{$content.login.submit.value}</Button>
		</form>
	</Card.Content>
</Card.Root>
