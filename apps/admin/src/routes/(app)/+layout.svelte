<script lang="ts">
	import { isStaff } from "#lib/auth-redirect.js";
	import AppHeader from "#lib/components/layout/app-header.svelte";
	import AppSidebar from "#lib/components/layout/app-sidebar.svelte";
	import ConnectionToasts from "#lib/components/layout/connection-toasts.svelte";
	import * as Sidebar from "#lib/components/ui/sidebar/index.js";
	import * as Tooltip from "#lib/components/ui/tooltip/index.js";

	let { data, children } = $props();
	const level = $derived(data.admin?.level ?? 200);
</script>

<ConnectionToasts />

<Tooltip.Provider>
	<Sidebar.Provider>
		<AppSidebar email={data.admin?.email ?? null} {level} />
		<Sidebar.Inset class="min-w-0">
			<AppHeader staff={isStaff(level)} />
			<main class="flex min-w-0 flex-col gap-6 p-4 md:p-6">
				{@render children()}
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>
</Tooltip.Provider>
