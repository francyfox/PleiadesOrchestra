<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { Channel } from "$lib/api-types";
	import ChannelKeysCard from "$lib/components/channels/channel-keys-card.svelte";
	import ChannelsTable from "$lib/components/channels/channels-table.svelte";
	import CreateChannelForm from "$lib/components/channels/create-channel-form.svelte";
	import EditChannelDialog from "$lib/components/channels/edit-channel-dialog.svelte";

	let { data, form } = $props();

	const content = useIntlayer("channels");
	let editing = $state<Channel | null>(null);
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>

{#if form && "secret" in form && form.secret}
	<ChannelKeysCard secret={form.secret} />
{/if}

<ChannelsTable channels={data.channels} onEdit={(channel) => (editing = channel)} />

<CreateChannelForm />

<EditChannelDialog channel={editing} onClose={() => (editing = null)} />
