<script lang="ts">
	import LocaleSwitcher from "$lib/components/layout/locale-switcher.svelte";

	let { children } = $props();
</script>

<main class="relative flex min-h-svh items-center justify-center bg-muted/40 p-4">
	<div class="absolute top-4 right-4"><LocaleSwitcher /></div>
	<div class="w-full max-w-sm">{@render children()}</div>
</main>
