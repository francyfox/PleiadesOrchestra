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
	import { useFormat } from "$lib/i18n/use-format";
	import { DEFAULT_PAGE_SIZE } from "$lib/pagination";
	import RequestStatusBadge from "./request-status-badge.svelte";
	import StepChips from "./step-chips.svelte";

	/** One server-cut page of requests; clicking a row opens the request's own page. */
	let {
		requests,
		total,
		page,
		hrefFor,
		onSelect,
		filtered = false,
	}: {
		requests: RequestSummary[];
		total: number;
		page: number;
		/** URL of a page of the list. */
		hrefFor: (page: number) => string;
		/** A row was clicked: open that request. */
		onSelect: (id: string) => void;
		/** A filter is on: an empty page means "nothing matches", not "no requests". */
		filtered?: boolean;
	} = $props();

	const content = useIntlayer("flow");
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
				cell: (ctx) => renderSnippet(stepsCell, ctx.row.original),
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
</script>

{#snippet statusCell(status: RequestSummary["status"])}
	<RequestStatusBadge {status} />
{/snippet}

{#snippet stepsCell(request: RequestSummary)}
	<StepChips steps={request.steps} status={request.status} />
{/snippet}

<DataTable
	{table}
	emptyText={filtered ? $content.filters.noMatch.value : $content.requests.empty.value}
	onRowClick={(request) => onSelect(request.id)}
	server={{
		page,
		pageSize: DEFAULT_PAGE_SIZE,
		total,
		href: hrefFor,
	}}
/>
