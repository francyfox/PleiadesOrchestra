<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import { standingAlert } from "#lib/billing-alert.js";
	import * as Alert from "#lib/components/ui/alert/index.js";
	import { queries } from "#lib/query/queries.js";

	/** Header banner for a customer whose channels are paused (red) or about to be (yellow). Mount for customers only: staff get 403. */
	const standing = createQuery(() => queries.standing());
	const content = useIntlayer("billing");
	const alert = $derived(standing.data ? standingAlert(standing.data) : null);
</script>

{#if alert}
	<Alert.Root
		variant={alert.tone === "red" ? "destructive" : "default"}
		class={alert.tone === "yellow" ? "basis-full border-amber-500/50 text-amber-700 dark:text-amber-400" : "basis-full"}
	>
		<Alert.Description class="flex flex-wrap items-center gap-x-3">
			<span>{$content.alert[alert.key].value}</span>
			<a href="/billing" class="font-medium underline">{$content.alert.link.value}</a>
		</Alert.Description>
	</Alert.Root>
{/if}
