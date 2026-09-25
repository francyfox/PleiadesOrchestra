<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { PlanRun, TraceEvent } from "$lib/api-types";
	import * as Card from "$lib/components/ui/card/index.js";
	import { timelineBars } from "$lib/goap-graph";
	import { useFormat } from "$lib/i18n/use-format";

	let { run, events }: { run: PlanRun; events: TraceEvent[] } = $props();

	const content = useIntlayer("goap");
	const format = useFormat();

	const bars = $derived(timelineBars(events));
	const span = $derived(
		Math.max(
			1,
			run.durationMs,
			...bars.map((bar) => bar.offsetMs + bar.durationMs),
		),
	);
</script>

<Card.Root>
	<Card.Header><Card.Title>{$content.run.timeline.value}</Card.Title></Card.Header>
	<Card.Content class="grid gap-1">
		{#each bars as bar (`${bar.attempt}-${bar.action}-${bar.offsetMs}`)}
			<div class="grid grid-cols-[10rem_1fr] items-center gap-2 text-xs">
				<span class="truncate">#{bar.attempt} {bar.action}</span>
				<div class="relative h-5 rounded bg-muted">
					<div
						class={["absolute h-5 rounded", bar.status === "done" ? "bg-emerald-500/70" : "bg-red-500/70"]}
						style:left={`${(bar.offsetMs / span) * 100}%`}
						style:width={`${Math.max(0.5, (bar.durationMs / span) * 100)}%`}
						title={$format.ms(bar.durationMs)}
					></div>
				</div>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{$content.run.noActions.value}</p>
		{/each}
	</Card.Content>
</Card.Root>
