<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import LevelBadge from "#lib/components/layout/level-badge.svelte";
	import { useFormat } from "#lib/i18n/use-format.js";
	import { queries } from "#lib/query/queries.js";
	import type { LoadLevel } from "#lib/system/load-level.js";

	/** Sidebar footer: the subscription's own status as a chip and the TR balance. Mount for customers only: staff get 403. */
	const billing = createQuery(() => queries.billing());
	const content = useIntlayer("billing");
	const plans = useIntlayer("plans");
	const format = useFormat();
	const LEVEL = {
		active: "ok",
		canceling: "warn",
		past_due: "warn",
		ended: "critical",
	} as const satisfies Record<string, LoadLevel>;
</script>

{#if billing.data}
	{@const { subscription, balanceUsd } = billing.data}
	<a href="/billing" class="grid gap-1 px-2 text-xs">
		{#if subscription}
			<LevelBadge level={LEVEL[subscription.status]} label={$content.summary.plan.value}>{$plans.status[subscription.status].value}</LevelBadge>
		{:else}
			<LevelBadge level="unknown" label={$content.summary.plan.value}>{$content.summary.noPlan.value}</LevelBadge>
		{/if}
		<span class="text-muted-foreground">{$content.summary.balance.value}: <span class="font-medium text-foreground tabular-nums">{$format.tr(balanceUsd)}</span></span>
	</a>
{/if}
