<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { PlanStatus } from "#lib/api-types.js";
	import SearchSelect from "#lib/components/search-select.svelte";
	import { PLAN_STATUSES } from "#lib/plan-filters.js";

	let {
		status,
		onChange,
	}: {
		status: PlanStatus | undefined;
		onChange: (status: PlanStatus | undefined) => void;
	} = $props();

	const content = useIntlayer("plans");
	const ALL = "all";
	const statuses = $derived([
		{ value: ALL, label: $content.filters.allStatuses.value },
		...PLAN_STATUSES.map((value) => ({
			value,
			label: $content.status[value].value,
		})),
	]);
</script>

<div class="flex flex-wrap items-center gap-2">
	<SearchSelect
		ariaLabel={$content.filters.status.value}
		searchPlaceholder={$content.filters.search.value}
		emptyText={$content.filters.nothingFound.value}
		options={statuses}
		value={status ?? ALL}
		onValueChange={(value) => onChange(value === ALL ? undefined : (value as PlanStatus))}
	/>
</div>
