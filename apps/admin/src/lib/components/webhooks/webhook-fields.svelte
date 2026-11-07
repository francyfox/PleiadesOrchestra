<script lang="ts" module>
	export const WEBHOOK_FORMATS = [
		"json",
		"discord",
		"slack",
		"telegram",
	] as const;
	export type WebhookFormat = (typeof WEBHOOK_FORMATS)[number];
</script>

<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import FormField from "#lib/components/form-field.svelte";
	import { FieldError } from "#lib/components/ui/field-error/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import * as Select from "#lib/components/ui/select/index.js";
	import type { FieldError as FieldErrorValue } from "#lib/forms/field-errors.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";

	/**
	 * The fields of the create and edit dialogs: name, type, URL (with a hint per type) and the events.
	 * `format` is bindable because the create dialog needs it to decide what to show after the save.
	 */
	let {
		idPrefix,
		events,
		eventLabel,
		errors,
		name = "",
		url = "",
		format = $bindable("json"),
		selected = [],
	}: {
		idPrefix: string;
		events: string[];
		eventLabel: (name: string) => string;
		errors?: Record<string, FieldErrorValue>;
		name?: string;
		url?: string;
		format?: WebhookFormat;
		selected?: string[];
	} = $props();

	const content = useIntlayer("webhooks");
	const errorText = useFieldErrorText();
</script>

<FormField id="{idPrefix}-name" name="name" label={$content.form.name.value} value={name} required error={$errorText(errors?.name)} />
<div class="grid gap-2">
	<Label>{$content.form.format.value}</Label>
	<Select.Root type="single" name="format" bind:value={format}>
		<Select.Trigger class="w-full">{$content.formats[format].value}</Select.Trigger>
		<Select.Content>
			{#each WEBHOOK_FORMATS as item (item)}
				<Select.Item value={item}>{$content.formats[item].value}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>
<FormField id="{idPrefix}-url" name="url" label={$content.form.url.value} type="url" value={url} required error={$errorText(errors?.url)} />
<p class="-mt-1 break-all text-xs text-muted-foreground">{$content.urlHints[format].value}</p>
<fieldset class="grid gap-2">
	<Label required>{$content.form.events.value}</Label>
	<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
		{#each events as event (event)}
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" name="events" value={event} checked={selected.includes(event)} class="size-4 accent-primary" />
				{eventLabel(event)}
			</label>
		{/each}
	</div>
	{#if errors?.events}<FieldError>{$errorText(errors.events)}</FieldError>{/if}
</fieldset>
