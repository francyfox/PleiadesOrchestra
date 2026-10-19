<script lang="ts">
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import {
		createColumnHelper,
		createTable,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { Channel, PlanStatus, Subscription } from "#lib/api-types.js";
	import DataTable from "#lib/components/data-table.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import { levelBadgeClass } from "../level-styles";
	import PlanChannelSelect from "./plan-channel-select.svelte";

	let { items, channels }: { items: Subscription[]; channels: Channel[] } =
		$props();

	const content = useIntlayer("plans");
	const format = useFormat();

	const level = {
		active: "ok",
		canceling: "warn",
		past_due: "critical",
		ended: "unknown",
	} as const satisfies Record<PlanStatus, keyof typeof levelBadgeClass>;

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, Subscription>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("customerEmail", {
				header: () => $content.columns.customer.value,
				cell: (ctx) => renderSnippet(customerCell, ctx.row.original),
			}),
			helper.accessor("plan", {
				header: () => $content.columns.plan.value,
				cell: (ctx) => ctx.getValue() ?? "—",
			}),
			helper.accessor("status", {
				header: () => $content.columns.status.value,
				cell: (ctx) => renderSnippet(statusCell, ctx.getValue()),
			}),
			helper.accessor("startedAt", {
				header: () => $content.columns.started.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.accessor("currentPeriodEnd", {
				header: () => $content.columns.expires.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.display({
				id: "channel",
				header: () => $content.columns.channel.value,
				cell: (ctx) => renderSnippet(channelCell, ctx.row.original),
			}),
		]),
		get data() {
			return items;
		},
	});
</script>

{#snippet customerCell(subscription: Subscription)}
	<div class="flex items-center gap-1">
		<span class="font-medium">{subscription.customerEmail ?? subscription.customerId}</span>
		{#if subscription.polarUrl}
			<a
				href={subscription.polarUrl}
				target="_blank"
				rel="noreferrer"
				aria-label={$content.openInPolar.value}
				title={$content.openInPolar.value}
				class="text-muted-foreground hover:text-foreground"
			><ExternalLinkIcon class="size-3.5" /></a>
		{/if}
	</div>
{/snippet}

{#snippet statusCell(status: PlanStatus)}
	<Badge variant="ghost" class={levelBadgeClass[level[status]]}>{$content.status[status].value}</Badge>
{/snippet}

{#snippet channelCell(subscription: Subscription)}
	<PlanChannelSelect {subscription} {channels} />
{/snippet}

<DataTable {table} emptyText={$content.empty.value} />
