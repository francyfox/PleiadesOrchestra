<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import type { RequestSummary } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { useFormat } from "$lib/i18n/use-format";
	import { DEFAULT_PAGE_SIZE } from "$lib/pagination";

	/** One server-cut page of requests; clicking a row opens its graph. */
	let {
		requests,
		total,
		page,
		selectedId,
		hrefFor,
		onSelect,
	}: {
		requests: RequestSummary[];
		total: number;
		page: number;
		selectedId: string | null;
		/** URL that shows `id` (or, for `null`, just a page) — keeps the other query parameter. */
		hrefFor: (change: { page?: number; id?: string | null }) => string;
		/** A row was clicked: open that request. */
		onSelect: (id: string) => void;
	} = $props();

	const content = useIntlayer("goap");
	const format = useFormat();

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, RequestSummary>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("startedAt", {
				header: () => $content.requests.columns.started.value,
				cell: (ctx) => $format.date(ctx.getValue()),
			}),
			helper.accessor("prompt", {
				header: () => $content.requests.columns.prompt.value,
				cell: (ctx) => ctx.getValue() ?? $content.requests.noPrompt.value,
			}),
			helper.accessor("status", {
				header: () => $content.requests.columns.status.value,
				cell: (ctx) => renderSnippet(statusCell, ctx.getValue()),
			}),
			helper.accessor("intent", {
				header: () => $content.requests.columns.intent.value,
				cell: (ctx) => ctx.getValue() ?? "—",
			}),
			helper.accessor("steps", {
				header: () => $content.requests.columns.steps.value,
				cell: (ctx) => ctx.getValue().join(" → ") || "—",
			}),
			helper.accessor("durationMs", {
				header: () => $content.requests.columns.duration.value,
				cell: (ctx) => $format.ms(ctx.getValue()),
			}),
		]),
		get data() {
			return requests;
		},
	});

	const variant = {
		running: "default",
		waiting: "secondary",
		succeeded: "outline",
		failed: "destructive",
		abandoned: "destructive",
	} as const;
</script>

{#snippet statusCell(status: RequestSummary["status"])}
	<Badge variant={variant[status]} class={status === "running" ? "animate-pulse" : ""}>
		{$content.requests.status[status].value}
	</Badge>
{/snippet}

<DataTable
	{table}
	emptyText={$content.requests.empty.value}
	rowClass={(request) => (request.id === selectedId ? "bg-muted" : "")}
	onRowClick={(request) => onSelect(request.id)}
	server={{
		page,
		pageSize: DEFAULT_PAGE_SIZE,
		total,
		href: (target) => hrefFor({ page: target }),
	}}
/>
