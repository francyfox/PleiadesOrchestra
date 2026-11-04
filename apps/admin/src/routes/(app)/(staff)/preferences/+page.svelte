<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import FinanceRatesCard from "#lib/components/settings/finance-rates-card.svelte";
	import PolarSyncCard from "#lib/components/settings/polar-sync-card.svelte";

	const content = useIntlayer("settings");
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>

<div class="grid max-w-3xl gap-6">
	<PolarSyncCard />
	<FinanceRatesCard />
</div>
