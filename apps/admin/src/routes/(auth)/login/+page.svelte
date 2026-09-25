<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { enhance } from "$app/forms";
	import FormField from "$lib/components/form-field.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";

	let { form } = $props();

	const content = useIntlayer("auth");
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.login.title.value}</Card.Title>
		<Card.Description>{$content.login.subtitle.value}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" use:enhance class="grid gap-4">
			<FormField id="email" label={$content.fields.email.value} type="email" autocomplete="email" required value={form?.email ?? ""} />
			<FormField id="password" label={$content.fields.password.value} type="password" autocomplete="current-password" required />
			{#if form?.error}
				<p class="text-sm text-destructive">{$content.errors[form.error].value}</p>
			{/if}
			<Button type="submit" class="w-full">{$content.login.submit.value}</Button>
		</form>
	</Card.Content>
</Card.Root>
