<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import { page } from "$app/state";
	import BlockIpForm from "$lib/components/blocked-ips/block-ip-form.svelte";
	import BlockedIpsTable from "$lib/components/blocked-ips/blocked-ips-table.svelte";
	import { useLiveQuery } from "$lib/live/use-live-query.svelte";
	import { DEFAULT_PAGE_SIZE } from "$lib/pagination";
	import { prefetched } from "$lib/query/prefetch";
	import { queries } from "$lib/query/queries";

	let { data } = $props();

	const live = useLiveQuery("blocked-ips", () => ({
		page: data.page,
		pageSize: DEFAULT_PAGE_SIZE,
	}));
	const channelList = createQuery(() => queries.allChannels());
	const channels = $derived(prefetched(channelList).items);

	const content = useIntlayer("blocked-ips");
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
<p class="text-sm text-muted-foreground">{$content.subtitle.value}</p>

<BlockedIpsTable
	items={live.current.items}
	channels={channels}
	pagination={{
		page: data.page,
		pageSize: DEFAULT_PAGE_SIZE,
		total: live.current.total,
		href: (target) => `/blocked-ips?page=${target}`,
	}}
/>

<BlockIpForm {channels} defaultIp={page.url.searchParams.get("ip") ?? ""} />
