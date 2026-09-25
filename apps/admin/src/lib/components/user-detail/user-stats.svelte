<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { AdminUser } from "$lib/api-types";
	import * as Card from "$lib/components/ui/card/index.js";
	import { useFormat } from "$lib/i18n/use-format";

	let { user }: { user: AdminUser } = $props();

	const content = useIntlayer("user-detail");
	const format = useFormat();
</script>

<div class="grid gap-4 md:grid-cols-4">
	<Card.Root>
		<Card.Header>
			<Card.Description>{$content.stats.tokensTotal.value}</Card.Description>
			<Card.Title class="text-2xl">
				{$format.number(user.usage.inputTokens + user.usage.outputTokens)}
			</Card.Title>
		</Card.Header>
		<Card.Content class="text-xs text-muted-foreground">
			{$content.stats.tokensSplit({
				input: $format.number(user.usage.inputTokens),
				output: $format.number(user.usage.outputTokens),
			})}
		</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>{$content.stats.calls.value}</Card.Description>
			<Card.Title class="text-2xl">{$format.number(user.usage.calls)}</Card.Title>
		</Card.Header>
		<Card.Content class="text-xs text-muted-foreground">
			{$content.stats.withoutUsage({ count: user.usage.callsWithoutUsage })}
		</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>{$content.stats.lastSeen.value}</Card.Description>
			<Card.Title class="text-lg">{$format.date(user.lastSeenAt)}</Card.Title>
		</Card.Header>
		<Card.Content class="text-xs text-muted-foreground">
			{$content.stats.created({ date: $format.date(user.createdAt) })}
		</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>{$content.stats.access.value}</Card.Description>
			<Card.Title class="text-lg">
				{user.blockedAt
					? $content.stats.blocked.value
					: user.whitelistedAt
						? $content.stats.whitelisted.value
						: "—"}
			</Card.Title>
		</Card.Header>
		<Card.Content class="text-xs text-muted-foreground">
			{#if user.blockedAt}
				{$format.date(user.blockedAt)}{user.blockedReason ? ` · ${user.blockedReason}` : ""}
			{:else if user.whitelistedAt}
				{$content.stats.since({ date: $format.date(user.whitelistedAt) })}
			{/if}
		</Card.Content>
	</Card.Root>
</div>
