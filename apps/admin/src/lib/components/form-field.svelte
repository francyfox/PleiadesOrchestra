<script lang="ts">
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import type { FullAutoFill, HTMLInputTypeAttribute } from "svelte/elements";
	import { useIntlayer } from "svelte-intlayer";
	import { FieldError } from "#lib/components/ui/field-error/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Label } from "#lib/components/ui/label/index.js";

	/**
	 * Label + input pair used by every form in the admin. An explicit prop
	 * list rather than spreading Input's props: its type is a union too
	 * complex for svelte-check to forward.
	 */
	let {
		id,
		label,
		name = id,
		type = "text",
		value = "",
		placeholder,
		autocomplete,
		required = false,
		minlength,
		min,
		error,
	}: {
		id: string;
		label: string;
		name?: string;
		type?: HTMLInputTypeAttribute;
		value?: string | number;
		placeholder?: string;
		autocomplete?: FullAutoFill;
		required?: boolean;
		minlength?: number;
		min?: number;
		/** Localized message under the input (see `useFieldErrorText`); also marks the input invalid. */
		error?: string;
	} = $props();

	const common = useIntlayer("common");
	/** A password field gets an eye button that shows the typed text. */
	let shown = $state(false);
	const secret = $derived(type === "password");
</script>

<div class="grid gap-2">
	<Label for={id} {required}>{label}</Label>
	{#if secret}
		<div class="relative">
			<Input {id} {name} type={shown ? "text" : "password"} {value} {placeholder} {autocomplete} {required} {minlength} {min} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} class="pr-9" />
			<button
				type="button"
				class="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label={shown ? $common.hidePassword.value : $common.showPassword.value}
				aria-pressed={shown}
				aria-controls={id}
				onclick={() => (shown = !shown)}
			>
				{#if shown}<EyeOffIcon class="size-4" />{:else}<EyeIcon class="size-4" />{/if}
			</button>
		</div>
	{:else}
		<Input {id} {name} {type} {value} {placeholder} {autocomplete} {required} {minlength} {min} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
	{/if}
	{#if error}<FieldError id="{id}-error">{error}</FieldError>{/if}
</div>
