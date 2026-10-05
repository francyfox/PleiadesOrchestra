<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { Channel } from "$lib/api-types";
	import SearchSelect from "$lib/components/search-select.svelte";

	type Status = "pending" | "approved" | "rejected";

	/** Verdict and channel pickers (with search); a change goes to the list with that filter, page one. */
	let {
		status,
		channelId,
		channels,
		onChange,
	}: {
		status: Status | undefined;
		channelId: string | undefined;
		channels: Channel[];
		onChange: (filters: { status?: Status; channelId?: string }) => void;
	} = $props();

	const content = useIntlayer("intents");
	const ALL = "all";

	const statuses = $derived([
		{ value: ALL, label: $content.filters.allStatuses.value },
		...(["pending", "approved", "rejected"] as const).map((value) => ({
			value,
			label: $content.status[value].value,
		})),
	]);
	const channelOptions = $derived([
		{ value: ALL, label: $content.filters.allChannels.value },
		...channels.map((channel) => ({ value: channel.id, label: channel.name })),
	]);
</script>

<div class="flex flex-wrap items-center gap-2">
	<SearchSelect
		ariaLabel={$content.filters.status.value}
		searchPlaceholder={$content.filters.search.value}
		emptyText={$content.filters.nothingFound.value}
		options={statuses}
		value={status ?? ALL}
		onValueChange={(value) =>
			onChange({ status: value === ALL ? undefined : (value as Status), channelId })}
	/>
	<SearchSelect
		ariaLabel={$content.filters.channel.value}
		searchPlaceholder={$content.filters.search.value}
		emptyText={$content.filters.nothingFound.value}
		options={channelOptions}
		value={channelId ?? ALL}
		onValueChange={(value) =>
			onChange({ status, channelId: value === ALL ? undefined : value })}
	/>
</div>
