<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { Stats, UsageTotals } from "#lib/api-types.js";
	import CompactNumber from "#lib/components/compact-number.svelte";
	import * as Card from "#lib/components/ui/card/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";

	let { stats }: { stats: Stats } = $props();

	const content = useIntlayer("dashboard");
	const format = useFormat();

	const periods = ["today", "last7d", "last30d"] as const;

	const withoutUsageShare = (usage: UsageTotals) =>
		usage.calls === 0
			? "0%"
			: `${Math.round((usage.callsWithoutUsage / usage.calls) * 100)}%`;
	const totalTokens = (usage: UsageTotals) =>
		usage.inputTokens + usage.outputTokens;
</script>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
	{#each periods as period (period)}
		{@const usage = stats.usage[period]}
		<Card.Root>
			<Card.Header>
				<Card.Description>{$content.tokensFor({ period: $content.periods[period].value })}</Card.Description>
				<Card.Title class="text-2xl"><CompactNumber value={totalTokens(usage)} /></Card.Title>
			</Card.Header>
			<Card.Content class="text-xs text-muted-foreground">
				{$content.callsSummary({ calls: $format.number(usage.calls), share: withoutUsageShare(usage) })}
			</Card.Content>
		</Card.Root>
	{/each}
	<Card.Root>
		<Card.Header>
			<Card.Description>{$content.visitors.value}</Card.Description>
			<Card.Title class="text-2xl"><CompactNumber value={stats.visitors.total} /></Card.Title>
		</Card.Header>
		<Card.Content class="text-xs text-muted-foreground">
			<a class="underline-offset-4 hover:underline" href="/visitors?status=pending">
				{$content.pendingLink({ count: stats.visitors.pending })}
			</a>
			· {$content.visitorsSummary({ blocked: stats.visitors.blocked, anonymous: stats.visitors.anonymous })}
		</Card.Content>
	</Card.Root>
</div>
