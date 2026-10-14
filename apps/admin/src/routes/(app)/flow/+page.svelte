<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import RequestsFilters from "#lib/components/flow/requests-filters.svelte";
	import RequestsTable from "#lib/components/flow/requests-table.svelte";
	import { type RequestFilters, requestsHref } from "#lib/flow-filters.js";
	import { useLiveQuery } from "#lib/live/use-live-query.svelte.js";
	import { DEFAULT_PAGE_SIZE } from "#lib/pagination.js";
	import { goto } from "$app/navigation";

	let { data } = $props();

	const content = useIntlayer("flow");
	const filters = $derived<RequestFilters>({
		status: data.status,
		intent: data.intent,
	});
	const live = useLiveQuery("requests", () => ({
		page: data.page,
		pageSize: DEFAULT_PAGE_SIZE,
		...(data.status && { status: data.status }),
		...(data.intent && { intent: data.intent }),
	}));
</script>

<div>
	<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
	<p class="mt-1 text-sm text-muted-foreground">{$content.hint.value}</p>
</div>

<RequestsFilters
	{filters}
	hrefFor={(change) => requestsHref(change)}
	onNavigate={(href) => goto(href, { reset: false })}
/>

<RequestsTable
	requests={live.current.items}
	total={live.current.total}
	page={data.page}
	filtered={Boolean(data.status || data.intent)}
	hrefFor={(page) => requestsHref({ ...filters, page })}
	onSelect={(id) => goto(`/flow/${encodeURIComponent(id)}`)}
/>
