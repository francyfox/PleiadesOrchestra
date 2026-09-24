<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import type { UsageRow, UsageTotals } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import * as Card from "$lib/components/ui/card/index.js";
	import UsageChart from "$lib/components/usage-chart.svelte";
	import { formatMs, formatNumber, totalTokens } from "$lib/format";

	let { data } = $props();

	const periods: { label: string; key: keyof typeof data.stats.usage }[] = [
		{ label: "Сегодня", key: "today" },
		{ label: "7 дней", key: "last7d" },
		{ label: "30 дней", key: "last30d" },
	];

	const withoutUsageShare = (usage: UsageTotals) =>
		usage.calls === 0
			? "0%"
			: `${Math.round((usage.callsWithoutUsage / usage.calls) * 100)}%`;

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, UsageRow>();
	const usageColumns = (firstHeader: string) =>
		helper.columns([
			helper.accessor("label", {
				header: firstHeader,
				cell: (ctx) => renderSnippet(labelCell, ctx.row.original),
			}),
			helper.accessor("inputTokens", {
				header: "Вход",
				cell: (ctx) => formatNumber(ctx.getValue()),
			}),
			helper.accessor("outputTokens", {
				header: "Выход",
				cell: (ctx) => formatNumber(ctx.getValue()),
			}),
			helper.accessor("calls", {
				header: "Вызовов",
				cell: (ctx) => formatNumber(ctx.getValue()),
			}),
			helper.accessor("avgLatencyMs", {
				header: "Ср. латентность",
				cell: (ctx) => formatMs(ctx.getValue()),
			}),
		]);

	const usersTable = createTable({
		features,
		columns: usageColumns("Пользователь"),
		get data() {
			return data.topUsers;
		},
	});
	const channelsTable = createTable({
		features,
		columns: usageColumns("Канал"),
		get data() {
			return data.byChannel;
		},
	});
</script>

{#snippet labelCell(row: UsageRow)}
	{#if row.key && row.label !== row.key}
		<a class="underline-offset-4 hover:underline" href={`/users/${encodeURIComponent(row.key)}`}>{row.label}</a>
	{:else}
		{row.label}
	{/if}
{/snippet}

<h1 class="text-2xl font-semibold">Дашборд</h1>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
	{#each periods as period (period.key)}
		{@const usage = data.stats.usage[period.key]}
		<Card.Root>
			<Card.Header>
				<Card.Description>Токены — {period.label}</Card.Description>
				<Card.Title class="text-2xl">{formatNumber(totalTokens(usage))}</Card.Title>
			</Card.Header>
			<Card.Content class="text-xs text-muted-foreground">
				{formatNumber(usage.calls)} вызовов, без usage — {withoutUsageShare(usage)}
			</Card.Content>
		</Card.Root>
	{/each}
	<Card.Root>
		<Card.Header>
			<Card.Description>Пользователи</Card.Description>
			<Card.Title class="text-2xl">{formatNumber(data.stats.users.total)}</Card.Title>
		</Card.Header>
		<Card.Content class="text-xs text-muted-foreground">
			<a class="underline-offset-4 hover:underline" href="/users?status=pending">
				ждут белого списка: {data.stats.users.pending}
			</a>
			· заблокировано: {data.stats.users.blocked} · анонимных: {data.stats.users.anonymous}
		</Card.Content>
	</Card.Root>
</div>

<Card.Root>
	<Card.Header><Card.Title>Расход токенов по дням (30 дней)</Card.Title></Card.Header>
	<Card.Content><UsageChart rows={data.byDay} /></Card.Content>
</Card.Root>

<div class="grid gap-4 lg:grid-cols-2">
	<section class="grid gap-2">
		<h2 class="font-medium">Топ пользователей по расходу</h2>
		<DataTable table={usersTable} />
	</section>
	<section class="grid gap-2">
		<h2 class="font-medium">Расход по каналам</h2>
		<DataTable table={channelsTable} />
	</section>
</div>
