<script lang="ts">
	import "./layout.css";
	import { ModeWatcher } from "mode-watcher";
	import { setupIntlayer, useIntlayer } from "svelte-intlayer";
	import favicon from "$lib/assets/favicon.svg";
	import { Toaster } from "$lib/components/ui/sonner/index.js";

	let { data, children } = $props();

	// Synchronously, before any child calls useIntlayer: the first render must
	// already be in the locale resolved by hooks.server.ts (cookie →
	// Accept-Language → ru), which arrives via the root +layout.server.ts.
	// svelte-ignore state_referenced_locally
	setupIntlayer(data.locale);

	const common = useIntlayer("common");
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{$common.appTitle.value}</title>
</svelte:head>

<ModeWatcher />
<Toaster richColors />
{@render children()}
