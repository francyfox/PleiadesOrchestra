<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import SearchSelect from "$lib/components/search-select.svelte";
	import {
		REQUEST_INTENTS,
		REQUEST_STATUSES,
		type RequestFilters,
	} from "$lib/flow-filters";

	/** Status and intent pickers (with search); each change goes to the list with that filter, page one. */
	let {
		filters,
		hrefFor,
		onNavigate,
	}: {
		filters: RequestFilters;
		hrefFor: (change: RequestFilters) => string;
		onNavigate: (href: string) => void;
	} = $props();

	const content = useIntlayer("flow");

	const ALL = "all";
	const statuses = $derived([
		{ value: ALL, label: $content.filters.allStatuses.value },
		...REQUEST_STATUSES.map((status) => ({
			value: status,
			label: $content.requests.status[status].value,
		})),
	]);
	const intents = $derived([
		{ value: ALL, label: $content.filters.anyIntent.value },
		...[
			...REQUEST_INTENTS,
			// An intent that came in the URL but isn't in the list still shows as picked.
			...(filters.intent &&
			!(REQUEST_INTENTS as readonly string[]).includes(filters.intent)
				? [filters.intent]
				: []),
		].map((intent) => ({ value: intent, label: intent })),
	]);
</script>

<div class="flex flex-wrap items-center gap-2">
	<SearchSelect
		ariaLabel={$content.filters.status.value}
		searchPlaceholder={$content.filters.search.value}
		emptyText={$content.filters.nothingFound.value}
		options={statuses}
		value={filters.status ?? ALL}
		onValueChange={(value) =>
			onNavigate(hrefFor({ ...filters, status: value === ALL ? undefined : (value as RequestFilters["status"]) }))}
	/>
	<SearchSelect
		ariaLabel={$content.filters.intent.value}
		searchPlaceholder={$content.filters.search.value}
		emptyText={$content.filters.nothingFound.value}
		options={intents}
		value={filters.intent ?? ALL}
		onValueChange={(value) =>
			onNavigate(hrefFor({ ...filters, intent: value === ALL ? undefined : value }))}
	/>
</div>
