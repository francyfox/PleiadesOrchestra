<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { goto } from "$app/navigation";
	import RequestPanel from "$lib/components/goap/request-panel.svelte";
	import RequestsTable from "$lib/components/goap/requests-table.svelte";
	import { useLiveQuery } from "$lib/live/use-live-query.svelte";
	import { DEFAULT_PAGE_SIZE } from "$lib/pagination";

	let { data } = $props();

	const content = useIntlayer("goap");
	const live = useLiveQuery("requests", () => ({
		page: data.page,
		pageSize: DEFAULT_PAGE_SIZE,
	}));

	/** `?page=&id=` with the given change applied; a page change drops nothing else. */
	function hrefFor(change: { page?: number; id?: string | null }): string {
		const params = new URLSearchParams();
		const page = change.page ?? data.page;
		const id = change.id === undefined ? data.id : change.id;
		if (page > 1) params.set("page", String(page));
		if (id) params.set("id", id);
		const query = params.toString();
		return query ? `?${query}` : "?";
	}
</script>

<div>
	<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
	<p class="mt-1 text-sm text-muted-foreground">{$content.hint.value}</p>
</div>

<RequestsTable
	requests={live.current.items}
	total={live.current.total}
	page={data.page}
	selectedId={data.id}
	{hrefFor}
	onSelect={(id) => goto(hrefFor({ id }), { noScroll: true, keepFocus: true })}
/>

{#if data.id}
	{#key data.id}
		<RequestPanel id={data.id} />
	{/key}
{:else}
	<p class="text-sm text-muted-foreground">{$content.graph.pick.value}</p>
{/if}
