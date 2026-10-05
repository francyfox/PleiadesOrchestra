<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { goto } from "$app/navigation";
	import RequestsTable from "$lib/components/goap/requests-table.svelte";
	import { useLiveQuery } from "$lib/live/use-live-query.svelte";
	import { DEFAULT_PAGE_SIZE } from "$lib/pagination";

	let { data } = $props();

	const content = useIntlayer("goap");
	const live = useLiveQuery("requests", () => ({
		page: data.page,
		pageSize: DEFAULT_PAGE_SIZE,
	}));

	const hrefFor = (page: number) => (page > 1 ? `?page=${page}` : "?");
</script>

<div>
	<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
	<p class="mt-1 text-sm text-muted-foreground">{$content.hint.value}</p>
</div>

<RequestsTable
	requests={live.current.items}
	total={live.current.total}
	page={data.page}
	{hrefFor}
	onSelect={(id) => goto(`/goap/${encodeURIComponent(id)}`)}
/>
