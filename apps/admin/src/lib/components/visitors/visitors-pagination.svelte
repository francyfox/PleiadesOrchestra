<script lang="ts">
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import { useIntlayer } from "svelte-intlayer";
	import type { VisitorsPage } from "#lib/api-types.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import { pageCount } from "#lib/pagination.js";
	import {
		nextPage,
		prevPage,
		type VisitorsTableState,
		visitorsStateToSearch,
	} from "#lib/visitors-table-state.js";

	/** Cursor paging: only forward from the server, "back" replays the trail kept in the URL. */
	let { state, page }: { state: VisitorsTableState; page: VisitorsPage } =
		$props();

	const common = useIntlayer("common");
	const format = useFormat();

	const hrefFor = (next: VisitorsTableState) => {
		const search = visitorsStateToSearch(next).toString();
		return search ? `/visitors?${search}` : "/visitors";
	};

	const labels = $derived($common.pagination);
	const current = $derived(state.trail.length + 1);
	const pages = $derived(pageCount(page.total, state.limit));
</script>

{#if page.total > state.limit}
	<div class="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
		<span>{labels.total({ count: $format.number(page.total) })}</span>
		<div class="flex items-center gap-2">
			<span class="tabular-nums">{labels.page({ page: current, pages })}</span>
			<Button size="sm" variant="outline" href={hrefFor(prevPage(state))} disabled={state.trail.length === 0} aria-label={labels.prev.value}>
				<ChevronLeftIcon />
			</Button>
			<Button
				size="sm"
				variant="outline"
				href={page.nextCursor ? hrefFor(nextPage(state, page.nextCursor)) : undefined}
				disabled={!page.nextCursor}
				aria-label={labels.next.value}
			>
				<ChevronRightIcon />
			</Button>
		</div>
	</div>
{/if}
