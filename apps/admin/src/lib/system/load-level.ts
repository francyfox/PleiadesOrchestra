import type { SystemSnapshot } from "$lib/system-types";

export type LoadLevel = "ok" | "warn" | "critical" | "unknown";

export interface LoadThresholds {
	warn: number;
	critical: number;
}

const DEFAULT_THRESHOLDS: LoadThresholds = { warn: 70, critical: 90 };

const SEVERITY: Record<LoadLevel, number> = {
	unknown: 0,
	ok: 1,
	warn: 2,
	critical: 3,
};

/** Green / yellow / red for a 0–100 utilisation; `null` (no reading) is never green. */
export function loadLevel(
	percent: number | null,
	thresholds: LoadThresholds = DEFAULT_THRESHOLDS,
): LoadLevel {
	if (percent === null) return "unknown";
	if (percent >= thresholds.critical) return "critical";
	if (percent >= thresholds.warn) return "warn";
	return "ok";
}

/** The most severe of `levels`; `unknown` only wins when nothing else is known. */
export function worstLevel(levels: readonly LoadLevel[]): LoadLevel {
	return levels.reduce<LoadLevel>(
		(worst, level) => (SEVERITY[level] > SEVERITY[worst] ? level : worst),
		"unknown",
	);
}

export interface SnapshotLevels {
	cpu: LoadLevel;
	ram: LoadLevel;
	gpu: LoadLevel;
	vram: LoadLevel;
	overall: LoadLevel;
}

const share = (used: number | null, total: number | null): number | null =>
	used === null || total === null || total <= 0 ? null : (used / total) * 100;

/**
 * Level of each header-meter metric plus the worst of them. An integrated
 * GPU is judged by GTT (system RAM mapped for it): its VRAM is a small
 * carve-out that sits full without meaning anything.
 */
export function snapshotLevels(snapshot: SystemSnapshot): SnapshotLevels {
	const { memory } = snapshot;
	const gpu = snapshot.gpus[0];
	const memoryUsed = memory.totalBytes - memory.availableBytes;

	const cpu = loadLevel(snapshot.cpuBusyPercent);
	const ram = loadLevel(share(memoryUsed, memory.totalBytes));
	const gpuBusy = loadLevel(gpu?.busyPercent ?? null);
	const vram = loadLevel(
		gpu
			? gpu.uma
				? share(gpu.gttUsedBytes, gpu.gttTotalBytes)
				: share(gpu.vramUsedBytes, gpu.vramTotalBytes)
			: null,
	);

	return {
		cpu,
		ram,
		gpu: gpuBusy,
		vram,
		overall: worstLevel([cpu, ram, gpuBusy, vram]),
	};
}
