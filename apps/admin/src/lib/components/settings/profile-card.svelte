<script lang="ts">
	import { ChangeEmailInput, UpdateMeInput } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { meActions } from "#lib/actions.js";
	import type { Me } from "#lib/api-types.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { TimeZoneSelect } from "#lib/components/ui/time-zone-select/index.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import { invalidateAll } from "$app/navigation";
	import { useSettingsEnhance } from "./use-settings-enhance";

	let { me }: { me: Me } = $props();

	const content = useIntlayer("settings");
	const common = useIntlayer("common");
	const format = useFormat();

	const errorText = useFieldErrorText();
	const rename = useSettingsEnhance(meActions.rename, {
		schema: UpdateMeInput,
		// The session carries the zone every date is shown in.
		onSuccess: () => invalidateAll(),
	});
	// svelte-ignore state_referenced_locally
	let zone = $state(me.timeZone);
	const nameErrors = rename.errors;
	const changeEmail = useSettingsEnhance(meActions.changeEmail, {
		schema: ChangeEmailInput,
		resetOnSuccess: true,
		successText: () => $content.profile.emailSent.value,
	});
	const emailErrors = changeEmail.errors;
</script>

<Card.Root>
	<Card.Header><Card.Title>{$content.profile.title.value}</Card.Title></Card.Header>
	<Card.Content class="grid gap-6">
		<form use:rename novalidate class="grid max-w-md gap-3">
			<FormField id="name" label={$content.profile.name.value} value={me.name} autocomplete="name" required error={$errorText($nameErrors?.name)} />
			<div class="grid gap-2">
				<Label>{$content.profile.timeZone.value}</Label>
				<TimeZoneSelect bind:value={zone} name="timeZone" ariaLabel={$content.profile.timeZone.value} searchPlaceholder={$content.profile.timeZoneSearch.value} emptyText={$content.profile.timeZoneEmpty.value} class="w-full" />
			</div>
			<div><Button type="submit">{$common.save.value}</Button></div>
		</form>
		<form use:changeEmail novalidate class="grid max-w-md gap-3">
			<FormField id="email" label={$content.profile.email.value} value={me.email} type="email" autocomplete="email" required error={$errorText($emailErrors?.email)} />
			<div><Button type="submit">{$content.profile.changeEmail.value}</Button></div>
		</form>
		<p class="text-xs text-muted-foreground">
			{$content.inactivity({ date: me.lastActiveAt === null ? $content.neverActive.value : $format.date(me.lastActiveAt) })}
		</p>
	</Card.Content>
</Card.Root>
