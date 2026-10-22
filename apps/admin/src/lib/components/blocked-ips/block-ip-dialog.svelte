<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { BlockedIpForm, CustomerBlockedIpForm } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { blockedIpActions } from "#lib/actions.js";
	import type { Channel } from "#lib/api-types.js";
	import { isStaff } from "#lib/auth-redirect.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { FieldError } from "#lib/components/ui/field-error/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";
	import { page } from "$app/state";
	import { useBlockedIpEnhance } from "./use-blocked-ip-enhance";

	/**
	 * The "+ Add" button of the blocked-IPs page and the dialog with the form.
	 * Only web channels have anonymous visitors to block by IP. A `defaultIp`
	 * (the visitor page links here with `?ip=`) opens the dialog with it filled in.
	 * Only staff block globally; a customer must pick one of their channels.
	 */
	let {
		channels,
		defaultIp = "",
	}: { channels: Channel[]; defaultIp?: string } = $props();

	const content = useIntlayer("blocked-ips");
	const common = useIntlayer("common");

	let open = $state(false);
	$effect(() => {
		if (defaultIp) open = true;
	});
	const staff = $derived(isStaff(page.data.admin?.level ?? 200));
	const submitted = useBlockedIpEnhance(
		blockedIpActions.create,
		undefined,
		() => {
			open = false;
		},
		// shortcut: the schema follows the level at mount, not a later session change; upgrade if the level can change under an open page.
		{
			schema: isStaff(page.data.admin?.level ?? 200)
				? BlockedIpForm
				: CustomerBlockedIpForm,
		},
	);
	const errors = submitted.errors;
	const errorText = useFieldErrorText();
	const webChannels = $derived(
		channels.filter((channel) => channel.kind === "web"),
	);
</script>

<Button onclick={() => (open = true)}>
	<PlusIcon class="size-4" />
	{$common.add.value}
</Button>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>{$content.form.title.value}</Dialog.Title></Dialog.Header>
		<form use:submitted novalidate class="grid gap-3">
			<FormField id="ip" label={$content.form.ip.value} value={defaultIp} required error={$errorText($errors?.ip)} />
			<FormField id="reason" label={$content.columns.reason.value} required error={$errorText($errors?.reason)} />
			<FormField id="expires" name="expiresInHours" label={$content.form.hours.value} type="number" value={24} required error={$errorText($errors?.expiresInHours)} />
			<div class="grid gap-2">
				<Label for="channel" required={!staff}>{$content.columns.channel.value}</Label>
				<select
					id="channel"
					name="channelId"
					aria-invalid={!!$errors?.channelId}
					class="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{#if staff}
						<option value="">{$content.allChannels.value}</option>
					{/if}
					{#each webChannels as channel (channel.id)}
						<option value={channel.id}>{channel.name}</option>
					{/each}
				</select>
				{#if $errors?.channelId}<FieldError>{$errorText($errors.channelId)}</FieldError>{/if}
			</div>
			<Dialog.Footer>
				<Button variant="ghost" type="button" onclick={() => (open = false)}>{$common.cancel.value}</Button>
				<Button type="submit">{$content.form.submit.value}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
