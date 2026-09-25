<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { UsersPage } from "$lib/api-types";
	import { Button } from "$lib/components/ui/button/index.js";
	import { useFormat } from "$lib/i18n/use-format";
	import {
		nextPage,
		prevPage,
		type UsersTableState,
		usersStateToSearch,
	} from "$lib/users-table-state";

	let { state, page }: { state: UsersTableState; page: UsersPage } = $props();

	const content = useIntlayer("users");
	const format = useFormat();

	const hrefFor = (next: UsersTableState) => {
		const search = usersStateToSearch(next).toString();
		return search ? `/users?${search}` : "/users";
	};
</script>

<div class="flex items-center justify-between text-sm text-muted-foreground">
	<span>{$content.total({ count: $format.number(page.total) })}</span>
	<div class="flex gap-2">
		<Button size="sm" variant="outline" href={hrefFor(prevPage(state))} disabled={state.trail.length === 0}>
			{$content.prev.value}
		</Button>
		<Button
			size="sm"
			variant="outline"
			href={page.nextCursor ? hrefFor(nextPage(state, page.nextCursor)) : undefined}
			disabled={!page.nextCursor}
		>
			{$content.next.value}
		</Button>
	</div>
</div>
