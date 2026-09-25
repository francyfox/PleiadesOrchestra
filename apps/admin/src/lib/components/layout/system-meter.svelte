<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { useFormat } from "$lib/i18n/use-format";
	import type { SystemSnapshot } from "$lib/system-types";

	/** Host CPU / RAM / GPU / VRAM in the header, refreshed from /api/system. */
	let { initial }: { initial: SystemSnapshot } = $props();

	const content = useIntlayer("system-meter");
	const format = useFormat();

	const POLL_MS = 5000;
	let polled = $state<SystemSnapshot | null>(null);
	const current = $derived(polled ?? initial);

	$effect(() => {
		const timer = setInterval(async () => {
			try {
				const response = await fetch("/api/system");
				// A lapsed session redirects to /login (HTML) — keep the last value.
				if (
					response.ok &&
					response.headers.get("content-type")?.includes("json")
				) {
					polled = await response.json();
				}
			} catch {
				// Offline for a moment — next tick retries.
			}
		}, POLL_MS);
		return () => clearInterval(timer);
	});

	const pct = (value: number | null) =>
		value === null ? "…" : `${Math.round(value)}%`;

	const ramUsed = $derived(
		current.memory.totalBytes - current.memory.availableBytes,
	);
	const gpu = $derived(current.gpus[0] ?? null);
</script>

<div class="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
	<span title={current.cpu.model}>
		<span class="font-medium text-foreground">CPU</span>
		{pct(current.cpuBusyPercent)}
		<span class="hidden sm:inline">
			· {$content.cores({ physical: current.cpu.physicalCores, logical: current.cpu.logicalCores })}
		</span>
	</span>
	<span>
		<span class="font-medium text-foreground">RAM</span>
		{$format.gbPair(ramUsed, current.memory.totalBytes)}
	</span>
	{#if gpu}
		<span title={`${gpu.card} · ${gpu.driver ?? "?"} · ${gpu.pciId ?? ""}`}>
			<span class="font-medium text-foreground">GPU</span>
			{pct(gpu.busyPercent)}
		</span>
		<span title={gpu.uma ? $content.umaHint.value : undefined}>
			<span class="font-medium text-foreground">VRAM</span>
			{$format.gbPair(gpu.vramUsedBytes, gpu.vramTotalBytes)}
			{#if gpu.uma}
				<span class="hidden md:inline">· GTT {$format.gbPair(gpu.gttUsedBytes, gpu.gttTotalBytes)}</span>
			{/if}
		</span>
	{:else}
		<span><span class="font-medium text-foreground">GPU</span> {$content.noGpu.value}</span>
	{/if}
</div>
