<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { untrack } from "svelte";
	import { useIntlayer } from "svelte-intlayer";
	import { toast } from "svelte-sonner";
	import BillingActions from "#lib/components/billing/billing-actions.svelte";
	import BillingDetails from "#lib/components/billing/billing-details.svelte";
	import { queryClient } from "#lib/query/client.js";
	import { prefetched } from "#lib/query/prefetch.js";
	import { queries } from "#lib/query/queries.js";
	import { page } from "$app/state";

	const content = useIntlayer("billing");
	const billing = createQuery(() => queries.billing());

	// Polar sends the user back with ?checkout=success; the webhook may land a moment later, so refetch now.
	$effect(() => {
		if (page.url.searchParams.get("checkout") !== "success") return;
		untrack(() => {
			toast.success($content.checkoutSuccess.value);
			queryClient.invalidateQueries();
		});
	});
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>

<div class="grid max-w-4xl gap-6">
	<BillingActions />
	<BillingDetails billing={prefetched(billing)} />
</div>
