<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { goto } from "$app/navigation";
	import { authActions } from "$lib/actions";
	import FormField from "$lib/components/form-field.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";

	const content = useIntlayer("auth");

	let failure = $state<{
		error: "weak_credentials" | "registration_closed" | "signup_failed";
		min?: number;
		detail?: string;
	} | null>(null);
	let pending = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (pending) return;
		pending = true;
		failure = null;
		const result = await authActions.register(
			new FormData(event.currentTarget as HTMLFormElement),
		);
		pending = false;
		if (!result.ok) {
			const { error, min, detail } = result.data;
			failure = {
				error:
					error === "weak_credentials" || error === "registration_closed"
						? error
						: "signup_failed",
				min: typeof min === "number" ? min : undefined,
				detail: typeof detail === "string" ? detail : undefined,
			};
			return;
		}
		await goto("/", { invalidateAll: true });
	}

	const errorText = $derived.by(() => {
		if (!failure) return null;
		if (failure.error === "weak_credentials") {
			return String(
				$content.errors.weak_credentials({ min: failure.min ?? 8 }),
			);
		}
		const base = $content.errors[failure.error].value;
		return failure.detail ? `${base}: ${failure.detail}` : base;
	});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.register.title.value}</Card.Title>
		<Card.Description>{$content.register.subtitle.value}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form onsubmit={submit} class="grid gap-4">
			<FormField id="name" label={$content.fields.name.value} autocomplete="name" />
			<FormField id="email" label={$content.fields.email.value} type="email" autocomplete="email" required />
			<FormField id="password" label={$content.fields.password.value} type="password" autocomplete="new-password" minlength={8} required />
			{#if errorText}
				<p class="text-sm text-destructive">{errorText}</p>
			{/if}
			<Button type="submit" class="w-full" disabled={pending}>{$content.register.submit.value}</Button>
		</form>
	</Card.Content>
</Card.Root>
