<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderComponent,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { Customer } from "#lib/api-types.js";
	import DataTable from "#lib/components/data-table.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import type { ServerPagination } from "#lib/pagination.js";
	import UserRowActions from "./user-row-actions.svelte";

	let {
		users,
		pagination,
	}: { users: Customer[]; pagination: ServerPagination } = $props();

	const content = useIntlayer("users");
	const format = useFormat();

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, Customer>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("name", { header: () => $content.columns.name.value }),
			helper.accessor("email", {
				header: () => $content.columns.email.value,
				cell: (ctx) => renderSnippet(emailCell, ctx.row.original),
			}),
			helper.accessor("createdAt", {
				header: () => $content.columns.created.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.accessor("lastActiveAt", {
				header: () => $content.columns.lastActive.value,
				cell: (ctx) => {
					const at = ctx.getValue();
					return at === null ? $content.never.value : $format.date(at);
				},
			}),
			helper.accessor("channelsCount", {
				header: () => $content.columns.channels.value,
			}),
			helper.accessor("banned", {
				header: () => $content.columns.status.value,
				cell: (ctx) => renderSnippet(status, ctx.getValue()),
			}),
			helper.display({
				id: "actions",
				cell: (ctx) =>
					renderComponent(UserRowActions, { user: ctx.row.original }),
			}),
		]),
		get data() {
			return users;
		},
	});
</script>

{#snippet emailCell(user: Customer)}
	{user.email}
	<Badge variant={user.emailVerified ? "secondary" : "outline"} class="ml-1">
		{user.emailVerified ? $content.verified.value : $content.unverified.value}
	</Badge>
{/snippet}

{#snippet status(banned: boolean)}
	{#if banned}
		<Badge variant="destructive">{$content.banned.value}</Badge>
	{:else}
		<Badge variant="outline">{$content.active.value}</Badge>
	{/if}
{/snippet}

<DataTable {table} server={pagination} emptyText={$content.empty.value} />
