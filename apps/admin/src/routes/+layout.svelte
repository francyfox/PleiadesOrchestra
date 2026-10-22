<script lang="ts">
	import "./layout.css";
	import { QueryClientProvider } from "@tanstack/svelte-query";
	import { ModeWatcher } from "mode-watcher";
	import { untrack } from "svelte";
	import { setupIntlayer, useIntlayer } from "svelte-intlayer";
	import FeedbackWidget from "#lib/components/layout/feedback-widget.svelte";
	import { Progress } from "#lib/components/ui/progress/index.js";
	import { Toaster } from "#lib/components/ui/sonner/index.js";
	import { queryClient } from "#lib/query/client.js";
	import { navigating } from "$app/state";

	let { data, children } = $props();

	// Synchronously, before any child calls useIntlayer: the first render must
	// already be in the locale resolved by +layout.ts (cookie → browser
	// language → ru).
	// svelte-ignore state_referenced_locally
	setupIntlayer(data.locale);

	const common = useIntlayer("common");

	// Navigation bar: creeps toward 90 while a page loads, fills when it is there.
	let progress = $state(0);
	$effect(() => {
		if (!navigating.to) {
			if (untrack(() => progress) > 0) progress = 100;
			const hide = setTimeout(() => (progress = 0), 300);
			return () => clearTimeout(hide);
		}
		progress = 10;
		const creep = setInterval(() => (progress += (90 - progress) / 8), 200);
		return () => clearInterval(creep);
	});

	// app.html ships lang="en"; screen readers and hyphenation need the real one.
	$effect(() => {
		document.documentElement.lang = data.locale;
	});
</script>

<svelte:head>
	<title>{$common.appTitle.value}</title>
</svelte:head>

{#if progress > 0}
	<Progress value={progress} class="fixed inset-x-0 top-0 z-50" />
{/if}
<ModeWatcher />
<Toaster richColors />
<FeedbackWidget user={data.admin} />
<QueryClientProvider client={queryClient}>
	{@render children()}
</QueryClientProvider>

<!-- Dev only, and imported on demand so a production build doesn't contain it. -->
{#if import.meta.env.DEV}
	{#await import("@tanstack/svelte-query-devtools") then { SvelteQueryDevtools }}
		<SvelteQueryDevtools client={queryClient} buttonPosition="top-right" />
	{/await}
{/if}
