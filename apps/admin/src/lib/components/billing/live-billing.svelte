<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { untrack } from "svelte";
	import { useLiveQuery } from "#lib/live/use-live-query.svelte.js";
	import { queryClient } from "#lib/query/client.js";
	import { queries } from "#lib/query/queries.js";

	/**
	 * Customers only (mounted in the header, so on every page): subscribes to the `billing` topic, which keeps the
	 * balance the sidebar and /billing read current, and refreshes the standing the alerts and the paused modal read
	 * whenever the billing changes (the standing request also sends the due low-balance mails). No markup.
	 */
	useLiveQuery("billing", () => ({}));
	const billing = createQuery(() => queries.billing());

	$effect(() => {
		void billing.data;
		untrack(() =>
			queryClient.invalidateQueries({ queryKey: ["billing", "standing"] }),
		);
	});
</script>
