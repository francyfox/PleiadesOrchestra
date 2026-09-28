<script lang="ts">
	import "./layout.css";
	import { QueryClientProvider } from "@tanstack/svelte-query";
	import { ModeWatcher } from "mode-watcher";
	import { setupIntlayer, useIntlayer } from "svelte-intlayer";
	import favicon from "$lib/assets/favicon.svg";
	import { Toaster } from "$lib/components/ui/sonner/index.js";
	import { queryClient } from "$lib/query/client";

	let { data, children } = $props();

	// Synchronously, before any child calls useIntlayer: the first render must
	// already be in the locale resolved by +layout.ts (cookie → browser
	// language → ru).
	// svelte-ignore state_referenced_locally
	setupIntlayer(data.locale);

	const common = useIntlayer("common");

	// app.html ships lang="ru"; screen readers and hyphenation need the real one.
	$effect(() => {
		document.documentElement.lang = data.locale;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{$common.appTitle.value}</title>
</svelte:head>

<ModeWatcher />
<Toaster richColors />
<QueryClientProvider client={queryClient}>
	{@render children()}
</QueryClientProvider>

<!-- Dev only, and imported on demand so a production build doesn't contain it. -->
{#if import.meta.env.DEV}
	{#await import("@tanstack/svelte-query-devtools") then { SvelteQueryDevtools }}
		<SvelteQueryDevtools client={queryClient} buttonPosition="bottom-left" />
	{/await}
{/if}
