<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import LevelBadge from "#lib/components/layout/level-badge.svelte";
	import { Hint } from "#lib/components/ui/hint/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import { queries } from "#lib/query/queries.js";
	import type { LoadLevel } from "#lib/system/load-level.js";
	import { resolve } from "$app/paths";

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
	<a href={resolve("billing")} class="grid gap-3 px-2 text-xs">
		{#if subscription}
			<LevelBadge level={LEVEL[subscription.status]} label={$content.summary.plan.value}>{$plans.status[subscription.status].value}</LevelBadge>
		{:else}
			<LevelBadge level="unknown" label={$content.summary.plan.value}>{$content.summary.noPlan.value}</LevelBadge>
		{/if}
		<span class="flex min-w-0 gap-1 text-muted-foreground text-xl"><span class="shrink-0">{$content.summary.balance.value}:</span> <Hint class="min-w-0 font-medium text-foreground tabular-nums" text={$format.tr(balanceUsd)} hint={$format.trExact(balanceUsd)} /></span>
	</a>
{/if}
