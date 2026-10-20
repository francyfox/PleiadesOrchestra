<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderComponent,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { Channel, Subscription } from "#lib/api-types.js";
	import CopyValue from "#lib/components/copy-value.svelte";
	import DataTable from "#lib/components/data-table.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import { type OwnerAccount, ownerLabel } from "#lib/owner-label.js";
	import { DEFAULT_PAGE_SIZE } from "#lib/pagination.js";
	import ChannelRowActions from "./channel-row-actions.svelte";

	/** One server-cut page of channels (`page` of `total`, from `?page=`). */
	let {
		channels,
		total,
		page,
		staff,
		plans,
		owners,
		onEdit,
	}: {
		channels: Channel[];
		/** Staff see the plan and owner columns; a customer only has their own channels. */
		staff: boolean;
		/** All subscriptions; the one linked to a channel shows as its plan. */
		plans: Subscription[];
		owners: OwnerAccount[];
		total: number;
		page: number;
		onEdit: (channel: Channel) => void;
	} = $props();

	const content = useIntlayer("channels");
	const format = useFormat();

	/** The channel's live plan with its expiry; an ended one only if there is nothing else. */
	function planOf(channelId: string) {
		const linked = plans.filter((plan) => plan.channelId === channelId);
		const plan = linked.find((p) => p.status !== "ended") ?? linked[0];
		return plan
			? $content.planUntil({
					plan: plan.plan ?? "—",
					date: $format.date(plan.currentPeriodEnd),
				})
			: "—";
	}

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, Channel>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("name", {
				header: () => $content.columns.channel.value,
				cell: (ctx) => renderSnippet(nameCell, ctx.row.original),
			}),
			helper.accessor("kind", { header: () => $content.columns.kind.value }),
			helper.accessor("accessMode", {
				header: () => $content.columns.access.value,
				cell: (ctx) => $content.accessMode[ctx.getValue()].value,
			}),
			helper.accessor("allowedOrigins", {
				header: () => $content.columns.origins.value,
				cell: (ctx) => renderSnippet(origins, ctx.getValue()),
			}),
			helper.accessor("catalogLanguage", {
				header: () => $content.columns.catalogLanguage.value,
			}),
			helper.accessor("publishableKey", {
				header: () => $content.columns.publishableKey.value,
				cell: (ctx) => renderSnippet(publishableKey, ctx.getValue()),
			}),
			...(staff
				? [
						helper.display({
							id: "owner",
							header: () => $content.columns.owner.value,
							cell: (ctx) => renderSnippet(ownerCell, ctx.row.original.ownerId),
						}),
						helper.display({
							id: "plan",
							header: () => $content.columns.plan.value,
							cell: (ctx) => planOf(ctx.row.original.id),
						}),
					]
				: []),
			helper.accessor("createdAt", {
				header: () => $content.columns.created.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.display({
				id: "actions",
				cell: (ctx) =>
					renderComponent(ChannelRowActions, {
						channel: ctx.row.original,
						onEdit,
					}),
			}),
		]),
		get data() {
			return channels;
		},
	});
</script>

{#snippet nameCell(channel: Channel)}
	<div class="font-medium">{channel.name}</div>
	<div class="text-xs text-muted-foreground">{channel.slug}</div>
	{#if channel.disabledAt}<Badge variant="destructive">{$content.disabled.value}</Badge>{/if}
{/snippet}

{#snippet ownerCell(ownerId: string | null)}
	{@const owner = ownerLabel(ownerId, owners)}
	{#if owner}
		<div class="font-medium">{owner.name}</div>
		{#if owner.email}<div class="text-xs text-muted-foreground">{owner.email}</div>{/if}
	{:else}
		<Badge variant="outline">{$content.staffOwner.value}</Badge>
	{/if}
{/snippet}

{#snippet origins(list: string[])}
	{#if list.length}
		<div class="grid gap-0.5">
			{#each list as origin (origin)}<CopyValue value={origin} href={origin} />{/each}
		</div>
	{:else}—{/if}
{/snippet}

{#snippet publishableKey(key: string | null)}
	{#if key}<CopyValue value={key} />{:else}—{/if}
{/snippet}

<DataTable
	{table}
	emptyText={$content.empty.value}
	server={{ page, pageSize: DEFAULT_PAGE_SIZE, total, href: (target) => `/channels?page=${target}` }}
/>
