<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { useFormat } from "$lib/i18n/use-format";
	import { snapshotLevels } from "$lib/system/load-level";
	import { useSystemSnapshot } from "$lib/system/use-system-snapshot.svelte";
	import LevelBadge from "./level-badge.svelte";

	/** Host CPU / RAM / GPU / VRAM in the header. Live over a WebSocket while the tab is visible. */
	const content = useIntlayer("system-meter");
	const format = useFormat();

	const stream = useSystemSnapshot();
	const current = $derived(stream.current);
	const levels = $derived(snapshotLevels(current));

	const pct = (value: number | null) =>
		value === null ? "…" : `${Math.round(value)}%`;

	const ramUsed = $derived(
		current.memory.totalBytes - current.memory.availableBytes,
	);
	const gpu = $derived(current.gpus[0] ?? null);
	const levelLabel = (level: keyof typeof levels) =>
		$content.levels[levels[level]].value;
</script>

<div class="ml-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
	<LevelBadge level={levels.overall} label={levelLabel("overall")} title={$content.overallHint.value}>
		{$content.overall.value}: {levelLabel("overall")}
	</LevelBadge>
	<LevelBadge level={levels.cpu} label={levelLabel("cpu")} title={current.cpu.model}>
		<span class="font-medium">CPU</span>
		{pct(current.cpuBusyPercent)}
		<span class="hidden text-muted-foreground sm:inline">
			· {$content.cores({ physical: current.cpu.physicalCores, logical: current.cpu.logicalCores })}
		</span>
	</LevelBadge>
	<LevelBadge level={levels.ram} label={levelLabel("ram")}>
		<span class="font-medium">RAM</span>
		{$format.gbPair(ramUsed, current.memory.totalBytes)}
	</LevelBadge>
	{#if gpu}
		<LevelBadge level={levels.gpu} label={levelLabel("gpu")} title={`${gpu.card} · ${gpu.driver ?? "?"} · ${gpu.pciId ?? ""}`}>
			<span class="font-medium">GPU</span>
			{pct(gpu.busyPercent)}
		</LevelBadge>
		<LevelBadge level={levels.vram} label={levelLabel("vram")} title={gpu.uma ? $content.umaHint.value : undefined}>
			<span class="font-medium">VRAM</span>
			{$format.gbPair(gpu.vramUsedBytes, gpu.vramTotalBytes)}
			{#if gpu.uma}
				<span class="hidden text-muted-foreground md:inline">· GTT {$format.gbPair(gpu.gttUsedBytes, gpu.gttTotalBytes)}</span>
			{/if}
		</LevelBadge>
	{:else}
		<LevelBadge level="unknown" label={$content.levels.unknown.value}>
			<span class="font-medium">GPU</span>
			{$content.noGpu.value}
		</LevelBadge>
	{/if}
</div>
