<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import { goto } from "$app/navigation";
	import IntentsFilters from "$lib/components/intents/intents-filters.svelte";
	import IntentsTable from "$lib/components/intents/intents-table.svelte";
	import { useLiveQuery } from "$lib/live/use-live-query.svelte";
	import { DEFAULT_PAGE_SIZE } from "$lib/pagination";
	import { prefetched } from "$lib/query/prefetch";
	import { queries } from "$lib/query/queries";

	let { data } = $props();

	const content = useIntlayer("intents");
	const live = useLiveQuery("intents", () => ({
		page: data.page,
		pageSize: DEFAULT_PAGE_SIZE,
		...(data.status && { status: data.status }),
		...(data.channelId && { channelId: data.channelId }),
	}));
	const channelList = createQuery(() => queries.allChannels());
	const channels = $derived(prefetched(channelList).items);

	/** `?status=` (`any` is the explicit "no filter"; absent means pending) `&channel=` `&page=`. */
	function hrefFor(filters: {
		status?: string;
		channelId?: string;
		page?: number;
	}) {
		const params = new URLSearchParams();
		params.set("status", filters.status ?? "any");
		if (filters.channelId) params.set("channel", filters.channelId);
		if (filters.page && filters.page > 1)
			params.set("page", String(filters.page));
		return `?${params}`;
	}
</script>

<div>
	<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
	<p class="mt-1 text-sm text-muted-foreground">{$content.hint.value}</p>
</div>

<IntentsFilters
	status={data.status}
	channelId={data.channelId}
	{channels}
	onChange={(filters) => goto(hrefFor(filters), { keepFocus: true })}
/>

<IntentsTable
	items={live.current.items}
	filtered={Boolean(data.status || data.channelId)}
	pagination={{
		page: data.page,
		pageSize: DEFAULT_PAGE_SIZE,
		total: live.current.total,
		href: (page) => hrefFor({ status: data.status, channelId: data.channelId, page }),
	}}
/>
