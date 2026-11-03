<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import LevelBadge from "#lib/components/layout/level-badge.svelte";
	import { useFormat } from "#lib/i18n/use-format.js";
	import { queries } from "#lib/query/queries.js";

	/** Sidebar footer: the plan as a chip and the TR balance. Mount for customers only: staff get 403. */
	const standing = createQuery(() => queries.standing());
	const content = useIntlayer("billing");
	const format = useFormat();
	// `no_balance` still has a running plan; only these two mean the subscription itself is off.
	const planOff = $derived(
		standing.data?.reason === "no_plan" ||
			standing.data?.reason === "plan_expired",
	);
</script>

{#if standing.data}
	{@const data = standing.data}
	<a href="/billing" class="grid gap-1 px-2 text-xs">
		{#if planOff && data.reason}
			<LevelBadge level="critical" label={$content.summary.plan.value}>{$content.reasons[data.reason].value}</LevelBadge>
		{:else}
			<LevelBadge level={data.warn ? "warn" : "ok"} label={$content.summary.plan.value}>{$content.sidebar.active.value}</LevelBadge>
		{/if}
		<span class="text-muted-foreground">{$content.summary.balance.value}: <span class="font-medium text-foreground tabular-nums">{$format.tr(data.balanceUsd)}</span></span>
	</a>
{/if}
