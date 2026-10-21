<script lang="ts">
	import StandingAlert from "#lib/components/billing/standing-alert.svelte";
	import SystemMeter from "#lib/components/layout/system-meter.svelte";
	import * as Sidebar from "#lib/components/ui/sidebar/index.js";
	import LocaleSwitcher from "./locale-switcher.svelte";

	/** The meter shows the host's CPU/RAM/GPU: staff only. */
	let { staff }: { staff: boolean } = $props();
</script>

<header class="flex flex-wrap md:flex-nowrap min-h-12 items-center gap-3 border-b px-4 py-2">
	<Sidebar.Trigger />
	{#if staff}<SystemMeter />{/if}
	<LocaleSwitcher />
	{#if !staff}<StandingAlert />{/if}
</header>
