<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { Visitor } from "#lib/api-types.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";

	let { visitor }: { visitor: Visitor } = $props();

	const content = useIntlayer("visitor-detail");
	const format = useFormat();
</script>

<div class="grid gap-4 md:grid-cols-4">
	<Card.Root>
		<Card.Header>
			<Card.Description>{$content.stats.tokensTotal.value}</Card.Description>
			<Card.Title class="text-2xl">
				{$format.number(visitor.usage.inputTokens + visitor.usage.outputTokens)}
			</Card.Title>
		</Card.Header>
		<Card.Content class="text-xs text-muted-foreground">
			{$content.stats.tokensSplit({
				input: $format.number(visitor.usage.inputTokens),
				output: $format.number(visitor.usage.outputTokens),
			})}
		</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>{$content.stats.calls.value}</Card.Description>
			<Card.Title class="text-2xl">{$format.number(visitor.usage.calls)}</Card.Title>
		</Card.Header>
		<Card.Content class="text-xs text-muted-foreground">
			{$content.stats.withoutUsage({ count: visitor.usage.callsWithoutUsage })}
		</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>{$content.stats.lastSeen.value}</Card.Description>
			<Card.Title class="text-lg">{$format.date(visitor.lastSeenAt)}</Card.Title>
		</Card.Header>
		<Card.Content class="text-xs text-muted-foreground">
			{$content.stats.created({ date: $format.date(visitor.createdAt) })}
		</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>{$content.stats.access.value}</Card.Description>
			<Card.Title class="text-lg">
				{visitor.blockedAt
					? $content.stats.blocked.value
					: visitor.whitelistedAt
						? $content.stats.whitelisted.value
						: "—"}
			</Card.Title>
		</Card.Header>
		<Card.Content class="text-xs text-muted-foreground">
			{#if visitor.blockedAt}
				{$format.date(visitor.blockedAt)}{visitor.blockedReason ? ` · ${visitor.blockedReason}` : ""}
			{:else if visitor.whitelistedAt}
				{$content.stats.since({ date: $format.date(visitor.whitelistedAt) })}
			{/if}
		</Card.Content>
	</Card.Root>
</div>
