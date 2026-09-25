<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderComponent,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import DataTable from "$lib/components/data-table.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { useFormat } from "$lib/i18n/use-format";
	import AdminRowActions from "./admin-row-actions.svelte";
	import type { AdminRow } from "./admin-types";

	let {
		admins,
		currentAdminId,
		onChangePassword,
	}: {
		admins: AdminRow[];
		currentAdminId: string | null;
		onChangePassword: (admin: AdminRow) => void;
	} = $props();

	const content = useIntlayer("admins");
	const format = useFormat();

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, AdminRow>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("name", { header: () => $content.columns.name.value }),
			helper.accessor("email", { header: () => $content.columns.email.value }),
			helper.accessor("banned", {
				header: () => $content.columns.status.value,
				cell: (ctx) => renderSnippet(status, ctx.row.original),
			}),
			helper.accessor("createdAt", {
				header: () => $content.columns.created.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.display({
				id: "actions",
				cell: (ctx) =>
					renderComponent(AdminRowActions, {
						admin: ctx.row.original,
						currentAdminId,
						onChangePassword,
					}),
			}),
		]),
		get data() {
			return admins;
		},
	});
</script>

{#snippet status(admin: AdminRow)}
	{#if admin.banned}
		<Badge variant="destructive">{$content.banned.value}</Badge>
		{#if admin.banReason}<span class="ml-1 text-xs text-muted-foreground">{admin.banReason}</span>{/if}
	{:else}
		<Badge variant="outline">{$content.active.value}</Badge>
	{/if}
{/snippet}

<DataTable {table} />
