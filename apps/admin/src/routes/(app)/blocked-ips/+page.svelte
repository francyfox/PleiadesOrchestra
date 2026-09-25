<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import BlockIpForm from "$lib/components/blocked-ips/block-ip-form.svelte";
	import BlockedIpsTable from "$lib/components/blocked-ips/blocked-ips-table.svelte";

	let { data } = $props();

	const content = useIntlayer("blocked-ips");
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
<p class="text-sm text-muted-foreground">{$content.subtitle.value}</p>

<BlockedIpsTable items={data.items} channels={data.channels} />

<BlockIpForm channels={data.channels} />
