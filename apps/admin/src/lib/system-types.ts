/** Host hardware snapshot — shared by the server probe, the header and /recommendations. */

export interface CpuInfo {
	model: string;
	logicalCores: number;
	physicalCores: number;
	features: {
		avx2: boolean;
		fma: boolean;
		f16c: boolean;
		avx512: boolean;
		/** AVX-VNNI or AVX-512 VNNI — hardware int8 dot products. */
		avxVnni: boolean;
	};
}

export interface MemoryInfo {
	totalBytes: number;
	availableBytes: number;
}

export interface GpuInfo {
	card: string;
	driver: string | null;
	pciId: string | null;
	vramTotalBytes: number | null;
	vramUsedBytes: number | null;
	/** GPU-mapped system RAM (amdgpu GTT). */
	gttTotalBytes: number | null;
	gttUsedBytes: number | null;
	busyPercent: number | null;
	/** Integrated GPU sharing system RAM (small VRAM carve-out + large GTT). */
	uma: boolean;
}

export interface SystemSnapshot {
	cpu: CpuInfo;
	/** Busy share since the previous snapshot; null on the very first one. */
	cpuBusyPercent: number | null;
	memory: MemoryInfo;
	gpus: GpuInfo[];
	at: number;
}
