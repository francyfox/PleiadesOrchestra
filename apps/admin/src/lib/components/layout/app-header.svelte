<script lang="ts">
	import SystemMeter from "#lib/components/layout/system-meter.svelte";
	import * as Sidebar from "#lib/components/ui/sidebar/index.js";
	import LocaleSwitcher from "./locale-switcher.svelte";

	/** The meter shows the host's CPU/RAM/GPU: staff only. */
	let { staff }: { staff: boolean } = $props();
</script>

<header class="flex min-h-12 flex-wrap items-center gap-3 border-b px-4 py-2">
	<Sidebar.Trigger />
	{#if staff}<SystemMeter />{/if}
	<LocaleSwitcher />
</header>
