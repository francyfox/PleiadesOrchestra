<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { useIntlayer } from "svelte-intlayer";
	import { blockedIpActions } from "$lib/actions";
	import type { Channel } from "$lib/api-types";
	import FormField from "$lib/components/form-field.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { useBlockedIpEnhance } from "./use-blocked-ip-enhance";

	/**
	 * The "+ Add" button of the blocked-IPs page and the dialog with the form.
	 * Only web channels have anonymous visitors to block by IP. A `defaultIp`
	 * (the user page links here with `?ip=`) opens the dialog with it filled in.
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
	const submitted = useBlockedIpEnhance(
		blockedIpActions.create,
		undefined,
		() => {
			open = false;
		},
	);
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
		<form use:submitted class="grid gap-3">
			<FormField id="ip" label={$content.form.ip.value} value={defaultIp} required />
			<FormField id="reason" label={$content.columns.reason.value} required />
			<FormField id="expires" name="expiresInHours" label={$content.form.hours.value} type="number" min={1} value={24} required />
			<div class="grid gap-2">
				<Label for="channel">{$content.columns.channel.value}</Label>
				<select
					id="channel"
					name="channelId"
					class="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<option value="">{$content.allChannels.value}</option>
					{#each webChannels as channel (channel.id)}
						<option value={channel.id}>{channel.name}</option>
					{/each}
				</select>
			</div>
			<Dialog.Footer>
				<Button variant="ghost" type="button" onclick={() => (open = false)}>{$common.cancel.value}</Button>
				<Button type="submit">{$content.form.submit.value}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
