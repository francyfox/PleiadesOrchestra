<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import PlansFilters from "#lib/components/plans/plans-filters.svelte";
	import PlansTable from "#lib/components/plans/plans-table.svelte";
	import { prefetched } from "#lib/query/prefetch.js";
	import { queries } from "#lib/query/queries.js";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";

	let { data } = $props();

	const content = useIntlayer("plans");
	const plans = createQuery(() => queries.subscriptions(data.status));
</script>

<div>
	<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
	<p class="mt-1 text-sm text-muted-foreground">{$content.subtitle.value}</p>
</div>

<PlansFilters
	status={data.status}
	onChange={(status) => goto(resolve(status ? `plans?status=${status}` : "plans"), { replaceState: true })}
/>

<PlansTable items={prefetched(plans).items} />
