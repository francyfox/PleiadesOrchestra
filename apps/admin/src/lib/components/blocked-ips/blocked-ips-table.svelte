<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import { enhance } from "$app/forms";
	import type { BlockedIp, Channel } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { useFormat } from "$lib/i18n/use-format";
	import { useBlockedIpEnhance } from "./use-blocked-ip-enhance";

	let { items, channels }: { items: BlockedIp[]; channels: Channel[] } =
		$props();

	const content = useIntlayer("blocked-ips");
	const format = useFormat();
	const submitted = useBlockedIpEnhance();

	const channelName = (id: string | null) =>
		id
			? (channels.find((channel) => channel.id === id)?.name ?? id)
			: $content.allChannels.value;

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, BlockedIp>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("ipHash", {
				header: () => $content.columns.ipHash.value,
				cell: (ctx) => `${ctx.getValue().slice(0, 16)}…`,
			}),
			helper.accessor("channelId", {
				header: () => $content.columns.channel.value,
				cell: (ctx) => channelName(ctx.getValue()),
			}),
			helper.accessor("reason", {
				header: () => $content.columns.reason.value,
			}),
			helper.accessor("createdAt", {
				header: () => $content.columns.created.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.accessor("expiresAt", {
				header: () => $content.columns.expires.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.display({
				id: "actions",
				cell: (ctx) => renderSnippet(remove, ctx.row.original),
			}),
		]),
		get data() {
			return items;
		},
	});
</script>

{#snippet remove(item: BlockedIp)}
	<form method="POST" action="?/delete" use:enhance={submitted} class="flex justify-end">
		<input type="hidden" name="id" value={item.id} />
		<Button size="sm" variant="ghost" type="submit">{$content.lift.value}</Button>
	</form>
{/snippet}

<DataTable {table} emptyText={$content.empty.value} />
