import { type Static, t } from "elysia";
import { nullable } from "../common/common.schema.ts";

/** Host hardware snapshot — served by `GET /api/system`, used by the header meter and /recommendations. */

export const CpuInfo = t.Object({
	model: t.String(),
	logicalCores: t.Number(),
	physicalCores: t.Number(),
	features: t.Object({
		avx2: t.Boolean(),
		fma: t.Boolean(),
		f16c: t.Boolean(),
		avx512: t.Boolean(),
		/** AVX-VNNI or AVX-512 VNNI — hardware int8 dot products. */
		avxVnni: t.Boolean(),
	}),
});

export const MemoryInfo = t.Object({
	totalBytes: t.Number(),
	availableBytes: t.Number(),
});

export const GpuInfo = t.Object({
	card: t.String(),
	driver: nullable(t.String()),
	pciId: nullable(t.String()),
	vramTotalBytes: nullable(t.Number()),
	vramUsedBytes: nullable(t.Number()),
	/** GPU-mapped system RAM (amdgpu GTT). */
	gttTotalBytes: nullable(t.Number()),
	gttUsedBytes: nullable(t.Number()),
	busyPercent: nullable(t.Number()),
	/** Integrated GPU sharing system RAM (small VRAM carve-out + large GTT). */
	uma: t.Boolean(),
});

export const SystemSnapshot = t.Object({
	cpu: CpuInfo,
	/** Busy share since the previous snapshot; null on the very first one. */
	cpuBusyPercent: nullable(t.Number()),
	memory: MemoryInfo,
	gpus: t.Array(GpuInfo),
	at: t.Number(),
});

export type CpuInfo = Static<typeof CpuInfo>;
export type MemoryInfo = Static<typeof MemoryInfo>;
export type GpuInfo = Static<typeof GpuInfo>;
export type SystemSnapshot = Static<typeof SystemSnapshot>;
