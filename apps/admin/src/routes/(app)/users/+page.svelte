<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import UsersTable from "#lib/components/users/users-table.svelte";
	import { DEFAULT_PAGE_SIZE } from "#lib/pagination.js";
	import { prefetched } from "#lib/query/prefetch.js";
	import { queries } from "#lib/query/queries.js";

	let { data } = $props();

	// Not a live topic: the actions invalidate every query, so the table refetches after a ban or delete.
	const accounts = createQuery(() =>
		queries.accounts({ page: data.page, pageSize: DEFAULT_PAGE_SIZE }),
	);
	const page = $derived(prefetched(accounts));

	const content = useIntlayer("users");
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>

<UsersTable
	users={page.items}
	pagination={{
		page: data.page,
		pageSize: DEFAULT_PAGE_SIZE,
		total: page.total,
		href: (target) => `/users?page=${target}`,
	}}
/>
