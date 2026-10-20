<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { meActions } from "#lib/actions.js";
	import type { Me } from "#lib/api-types.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import { useSettingsEnhance } from "./use-settings-enhance";

	let { me }: { me: Me } = $props();

	const content = useIntlayer("settings");
	const common = useIntlayer("common");
	const format = useFormat();

	const rename = useSettingsEnhance(meActions.rename);
	const changeEmail = useSettingsEnhance(meActions.changeEmail, {
		resetOnSuccess: true,
		successText: () => $content.profile.emailSent.value,
	});
</script>

<Card.Root>
	<Card.Header><Card.Title>{$content.profile.title.value}</Card.Title></Card.Header>
	<Card.Content class="grid gap-6">
		<form use:rename class="grid max-w-md gap-3">
			<FormField id="name" label={$content.profile.name.value} value={me.name} autocomplete="name" required />
			<div><Button type="submit">{$common.save.value}</Button></div>
		</form>
		<form use:changeEmail class="grid max-w-md gap-3">
			<p class="text-sm text-muted-foreground">{$content.profile.currentEmail({ email: me.email })}</p>
			<FormField id="email" label={$content.profile.email.value} type="email" autocomplete="email" required />
			<div><Button type="submit">{$content.profile.changeEmail.value}</Button></div>
		</form>
		<p class="text-xs text-muted-foreground">
			{$content.inactivity({ date: me.lastActiveAt === null ? $content.neverActive.value : $format.date(me.lastActiveAt) })}
		</p>
	</Card.Content>
</Card.Root>
