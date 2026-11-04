<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import type { UsersQuery } from "#lib/users-query.js";
	import { resolve } from "$app/paths";

	/** GET form: the search lives in the URL (`?q=`), the server returns the matching page; the sort is kept. */
	let { query }: { query: UsersQuery } = $props();

	const content = useIntlayer("users");
</script>

<form method="GET" role="search" class="flex flex-wrap items-end gap-2">
	<Input type="search" name="q" placeholder={$content.search.placeholder.value} aria-label={$content.search.placeholder.value} value={query.q ?? ""} class="w-64" />
	{#if query.sort}<input type="hidden" name="sort" value={query.sort} />{/if}
	{#if query.order}<input type="hidden" name="order" value={query.order} />{/if}
	<Button type="submit" variant="secondary">{$content.search.submit.value}</Button>
	{#if query.q}<Button href={resolve("users")} variant="ghost">{$content.search.reset.value}</Button>{/if}
</form>
