<script lang="ts">
	import AppHeader from "$lib/components/layout/app-header.svelte";
	import AppSidebar from "$lib/components/layout/app-sidebar.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import * as Tooltip from "$lib/components/ui/tooltip/index.js";

	let { data, children } = $props();
</script>

<Tooltip.Provider>
	<Sidebar.Provider>
		<AppSidebar email={data.admin?.email ?? null} />
		<Sidebar.Inset>
			<AppHeader system={data.system} />
			<main class="flex flex-col gap-6 p-4 md:p-6">
				{@render children()}
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>
</Tooltip.Provider>
