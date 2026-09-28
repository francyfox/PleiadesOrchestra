<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { Channel } from "$lib/api-types";
	import ChannelKeysCard from "$lib/components/channels/channel-keys-card.svelte";
	import ChannelsTable from "$lib/components/channels/channels-table.svelte";
	import CreateChannelForm from "$lib/components/channels/create-channel-form.svelte";
	import EditChannelDialog from "$lib/components/channels/edit-channel-dialog.svelte";
	import { issued } from "$lib/components/channels/issued-secret.svelte";

	let { data } = $props();

	const content = useIntlayer("channels");
	let editing = $state<Channel | null>(null);

	// The keys are shown once — don't carry them over to the next visit.
	$effect(() => () => {
		issued.current = null;
	});
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>

{#if issued.current}
	<ChannelKeysCard secret={issued.current} />
{/if}

<ChannelsTable
	channels={data.channels}
	total={data.total}
	page={data.page}
	onEdit={(channel) => (editing = channel)}
/>

<CreateChannelForm />

<EditChannelDialog channel={editing} onClose={() => (editing = null)} />
