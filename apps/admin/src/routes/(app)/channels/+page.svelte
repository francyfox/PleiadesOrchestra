<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { Channel } from "$lib/api-types";
	import ChannelKeysCard from "$lib/components/channels/channel-keys-card.svelte";
	import ChannelsTable from "$lib/components/channels/channels-table.svelte";
	import CreateChannelDialog from "$lib/components/channels/create-channel-dialog.svelte";
	import EditChannelDialog from "$lib/components/channels/edit-channel-dialog.svelte";
	import { issued } from "$lib/components/channels/issued-secret.svelte";
	import { useLiveQuery } from "$lib/live/use-live-query.svelte";
	import { DEFAULT_PAGE_SIZE } from "$lib/pagination";

	let { data } = $props();

	const live = useLiveQuery("channels", () => ({
		page: data.page,
		pageSize: DEFAULT_PAGE_SIZE,
	}));

	const content = useIntlayer("channels");
	let editing = $state<Channel | null>(null);

	// The keys are shown once — don't carry them over to the next visit.
	$effect(() => () => {
		issued.current = null;
	});
</script>

<div class="flex flex-wrap items-center justify-between gap-3">
	<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
	<CreateChannelDialog />
</div>

{#if issued.current}
	<ChannelKeysCard secret={issued.current} />
{/if}

<ChannelsTable
	channels={live.current.items}
	total={live.current.total}
	page={data.page}
	onEdit={(channel) => (editing = channel)}
/>

<EditChannelDialog channel={editing} onClose={() => (editing = null)} />
