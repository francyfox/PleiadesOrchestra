<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import UsersSearch from "#lib/components/users/users-search.svelte";
	import UsersTable from "#lib/components/users/users-table.svelte";
	import { prefetched } from "#lib/query/prefetch.js";
	import { queries } from "#lib/query/queries.js";
	import { usersHref } from "#lib/users-query.js";

	let { data } = $props();

	// Not a live topic: the actions invalidate every query, so the table refetches after a ban or delete.
	const accounts = createQuery(() => queries.accounts(data.query));
	const page = $derived(prefetched(accounts));

	const content = useIntlayer("users");
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>

<UsersSearch query={data.query} />

<UsersTable
	users={page.items}
	query={data.query}
	pagination={{
		page: data.query.page,
		pageSize: data.query.pageSize,
		total: page.total,
		href: (target) => usersHref(data.query, { page: target }),
	}}
/>
