<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { enhance } from "$app/forms";
	import FormField from "$lib/components/form-field.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";

	let { form } = $props();

	const content = useIntlayer("auth");

	const errorText = $derived.by(() => {
		if (!form?.error) return null;
		if (form.error === "weak_credentials") {
			return String($content.errors.weak_credentials({ min: form.min ?? 8 }));
		}
		const base = $content.errors[form.error].value;
		return "detail" in form && form.detail ? `${base}: ${form.detail}` : base;
	});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.register.title.value}</Card.Title>
		<Card.Description>{$content.register.subtitle.value}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" use:enhance class="grid gap-4">
			<FormField id="name" label={$content.fields.name.value} autocomplete="name" value={form?.name ?? ""} />
			<FormField id="email" label={$content.fields.email.value} type="email" autocomplete="email" required value={form?.email ?? ""} />
			<FormField id="password" label={$content.fields.password.value} type="password" autocomplete="new-password" minlength={8} required />
			{#if errorText}
				<p class="text-sm text-destructive">{errorText}</p>
			{/if}
			<Button type="submit" class="w-full">{$content.register.submit.value}</Button>
		</form>
	</Card.Content>
</Card.Root>
