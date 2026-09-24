<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import type { RunLlmCall } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import FlowGraph from "$lib/components/flow-graph.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { formatDate, formatMs, formatNumber, formatValue } from "$lib/format";
	import {
		type EffectRow,
		effectsRows,
		formatGoal,
		timelineBars,
		traceToGraph,
	} from "$lib/goap-graph";

	let { data } = $props();

	const run = $derived(data.details.run);
	const graph = $derived(
		traceToGraph(data.details.events, run.goal, data.details.llmCalls),
	);
	const effects = $derived(effectsRows(data.details.events));
	const bars = $derived(timelineBars(data.details.events));
	const span = $derived(
		Math.max(
			1,
			run.durationMs,
			...bars.map((bar) => bar.offsetMs + bar.durationMs),
		),
	);

	const STATUS_TEXT: Record<string, string> = {
		done: "выполнено",
		diverged: "эффекты разошлись",
		skipped: "пропущено: предусловия",
		failed: "упало",
		started: "начато",
		not_reached: "не дошли",
		reached: "цель достигнута",
		missed: "цель не достигнута",
	};

	const nodeDetails = (node: Record<string, unknown>) => {
		const lines = [STATUS_TEXT[String(node.status)] ?? String(node.status)];
		if (typeof node.cost === "number") lines.push(`cost ${node.cost}`);
		if (typeof node.durationMs === "number")
			lines.push(formatMs(node.durationMs));
		const tokens = node.tokens as { input: number; output: number } | undefined;
		if (tokens) lines.push(`${tokens.input} → ${tokens.output} ток.`);
		if (node.error) lines.push(String(node.error));
		return lines;
	};

	const features = tableFeatures({});
	const effectHelper = createColumnHelper<typeof features, EffectRow>();
	const effectsTable = createTable({
		features,
		columns: effectHelper.columns([
			effectHelper.accessor("attempt", { header: "Попытка" }),
			effectHelper.accessor("action", { header: "Действие" }),
			effectHelper.accessor("key", { header: "Факт" }),
			effectHelper.accessor("expected", {
				header: "Ожидалось",
				cell: (ctx) => formatValue(ctx.getValue()),
			}),
			effectHelper.accessor("observed", {
				header: "Получено",
				cell: (ctx) => formatValue(ctx.getValue()),
			}),
			effectHelper.accessor("match", {
				header: "",
				cell: (ctx) =>
					ctx.getValue() === "mismatch"
						? "расхождение"
						: ctx.getValue() === "extra"
							? "не объявлен"
							: "ок",
			}),
		]),
		get data() {
			return effects;
		},
	});

	const callHelper = createColumnHelper<typeof features, RunLlmCall>();
	const callsTable = createTable({
		features,
		columns: callHelper.columns([
			callHelper.accessor("actionName", {
				header: "Действие",
				cell: (ctx) => ctx.getValue() ?? "—",
			}),
			callHelper.accessor("kind", { header: "Тип" }),
			callHelper.accessor("model", { header: "Модель" }),
			callHelper.accessor("inputTokens", {
				header: "Вход",
				cell: (ctx) => formatNumber(ctx.getValue()),
			}),
			callHelper.accessor("outputTokens", {
				header: "Выход",
				cell: (ctx) => formatNumber(ctx.getValue()),
			}),
			callHelper.accessor("latencyMs", {
				header: "Латентность",
				cell: (ctx) => formatMs(ctx.getValue()),
			}),
			callHelper.accessor("ok", {
				header: "OK",
				cell: (ctx) => (ctx.getValue() ? "да" : "нет"),
			}),
		]),
		get data() {
			return data.details.llmCalls;
		},
	});
</script>

<div>
	<h1 class="text-2xl font-semibold">GOAP-прогон</h1>
	<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
		<Badge variant={run.succeeded ? "outline" : "destructive"}>
			{run.succeeded ? "цель достигнута" : "цель не достигнута"}
		</Badge>
		<span>цель: {formatGoal(run.goal)}</span>
		<span>· попыток: {run.attempts}</span>
		<span>· {formatMs(run.durationMs)}</span>
		<span>· {formatDate(run.createdAt)}</span>
		<a class="underline-offset-4 hover:underline" href={`/users/${encodeURIComponent(run.userId)}`}>· пользователь</a>
	</div>
</div>

<Card.Root>
	<Card.Header>
		<Card.Title>План</Card.Title>
		<Card.Description>Одна строка — одна попытка планирования; пунктир — перепланирование.</Card.Description>
	</Card.Header>
	<Card.Content><FlowGraph {graph} details={nodeDetails} /></Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header><Card.Title>Таймлайн</Card.Title></Card.Header>
	<Card.Content class="grid gap-1">
		{#each bars as bar (`${bar.attempt}-${bar.action}-${bar.offsetMs}`)}
			<div class="grid grid-cols-[10rem_1fr] items-center gap-2 text-xs">
				<span class="truncate">#{bar.attempt} {bar.action}</span>
				<div class="relative h-5 rounded bg-muted">
					<div
						class={["absolute h-5 rounded", bar.status === "done" ? "bg-emerald-500/70" : "bg-red-500/70"]}
						style:left={`${(bar.offsetMs / span) * 100}%`}
						style:width={`${Math.max(0.5, (bar.durationMs / span) * 100)}%`}
						title={formatMs(bar.durationMs)}
					></div>
				</div>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">Ни одно действие не выполнялось.</p>
		{/each}
	</Card.Content>
</Card.Root>

<section class="grid gap-2">
	<h2 class="font-medium">Ожидаемые и фактические эффекты</h2>
	<DataTable
		table={effectsTable}
		emptyText="Нет выполненных действий"
		rowClass={(row) => (row.match === "mismatch" ? "bg-red-500/10" : row.match === "extra" ? "text-muted-foreground" : "")}
	/>
</section>

<section class="grid gap-2">
	<h2 class="font-medium">Вызовы моделей</h2>
	<DataTable table={callsTable} emptyText="Вызовов не было" />
</section>
