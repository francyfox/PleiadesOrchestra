<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { enhance } from "$app/forms";
	import type { Channel } from "$lib/api-types";
	import FormField from "$lib/components/form-field.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { useBlockedIpEnhance } from "./use-blocked-ip-enhance";

	/** Only web channels have anonymous visitors to block by IP. */
	let { channels }: { channels: Channel[] } = $props();

	const content = useIntlayer("blocked-ips");
	const submitted = useBlockedIpEnhance();
	const webChannels = $derived(
		channels.filter((channel) => channel.kind === "web"),
	);
</script>

<Card.Root>
	<Card.Header><Card.Title>{$content.form.title.value}</Card.Title></Card.Header>
	<Card.Content>
		<form method="POST" action="?/create" use:enhance={submitted} class="grid max-w-xl gap-3">
			<FormField id="ip" label={$content.form.ip.value} required />
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
			<Button type="submit" class="w-fit">{$content.form.submit.value}</Button>
		</form>
	</Card.Content>
</Card.Root>
