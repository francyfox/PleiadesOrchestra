<script lang="ts">
	import SystemMeter from "$lib/components/layout/system-meter.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import type { SystemSnapshot } from "$lib/system-types";
	import LocaleSwitcher from "./locale-switcher.svelte";

	let { system }: { system: SystemSnapshot } = $props();
</script>

<header class="flex min-h-12 flex-wrap items-center gap-3 border-b px-4 py-2">
	<Sidebar.Trigger />
	<SystemMeter initial={system} />
	<LocaleSwitcher />
</header>
