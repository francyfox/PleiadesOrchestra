<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { CallKind, PerformanceReport } from "$lib/api-types";
	import * as Card from "$lib/components/ui/card/index.js";
	import { useFormat } from "$lib/i18n/use-format";

	/** One card per call kind: period-wide p50 plus p90/p99, volume and tok/s. */
	let {
		overall,
		kinds,
	}: { overall: PerformanceReport["overall"]; kinds: CallKind[] } = $props();

	const content = useIntlayer("performance");
	const common = useIntlayer("common");
	const format = useFormat();

	const statsFor = (kind: CallKind) =>
		overall.find((row) => row.kind === kind) ?? null;
</script>

<div class="grid gap-4 md:grid-cols-3">
	{#each kinds as kind (kind)}
		{@const stats = statsFor(kind)}
		<Card.Root>
			<Card.Header>
				<Card.Description>{$common.callKind[kind].value} · {$content.hints[kind].value}</Card.Description>
				<Card.Title class="text-2xl tabular-nums">
					{stats ? $content.p50({ value: $format.ms(stats.p50) }) : "—"}
				</Card.Title>
			</Card.Header>
			<Card.Content class="text-xs text-muted-foreground tabular-nums">
				{#if stats}
					{$content.summary({ p90: $format.ms(stats.p90), p99: $format.ms(stats.p99), calls: $format.number(stats.calls) })}{#if stats.failed}{$content.failed({ count: stats.failed })}{/if}
					{#if stats.tokensPerSecond !== null}{$content.tokensPerSecond({ value: stats.tokensPerSecond })}{/if}
				{:else}
					{$content.noCalls.value}
				{/if}
			</Card.Content>
		</Card.Root>
	{/each}
</div>
