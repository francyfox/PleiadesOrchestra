<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { page } from "$app/state";
	import BlockIpForm from "$lib/components/blocked-ips/block-ip-form.svelte";
	import BlockedIpsTable from "$lib/components/blocked-ips/blocked-ips-table.svelte";
	import { DEFAULT_PAGE_SIZE } from "$lib/pagination";

	let { data } = $props();

	const content = useIntlayer("blocked-ips");
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
<p class="text-sm text-muted-foreground">{$content.subtitle.value}</p>

<BlockedIpsTable
	items={data.items}
	channels={data.channels}
	pagination={{
		page: data.page,
		pageSize: DEFAULT_PAGE_SIZE,
		total: data.total,
		href: (target) => `/blocked-ips?page=${target}`,
	}}
/>

<BlockIpForm channels={data.channels} defaultIp={page.url.searchParams.get("ip") ?? ""} />
