import type { CpuInfo, GpuInfo, MemoryInfo } from "$lib/system-types";

/**
 * Host hardware probe. `/proc` and `/sys` aren't namespaced by Docker, so
 * the admin container sees the host's CPU, RAM and GPU (DRM sysfs) without
 * any extra mounts or privileges.
 */

export function parseCpuInfo(text: string): CpuInfo {
	const blocks = text.split(/\n\s*\n/).filter((b) => b.includes("processor"));
	const field = (block: string, name: string) =>
		block.match(new RegExp(`^${name}\\s*:\\s*(.*)$`, "m"))?.[1]?.trim();
	const cores = new Set(
		blocks.map((b) => `${field(b, "physical id")}:${field(b, "core id")}`),
	);
	const flags = new Set((field(blocks[0] ?? "", "flags") ?? "").split(/\s+/));
	return {
		model: field(blocks[0] ?? "", "model name") ?? "unknown",
		logicalCores: blocks.length,
		physicalCores: cores.size || blocks.length,
		features: {
			avx2: flags.has("avx2"),
			fma: flags.has("fma"),
			f16c: flags.has("f16c"),
			avx512: flags.has("avx512f"),
			avxVnni: flags.has("avx_vnni") || flags.has("avx512_vnni"),
		},
	};
}

export function parseMemInfo(text: string): MemoryInfo {
	const kb = (name: string) =>
		Number(text.match(new RegExp(`^${name}:\\s+(\\d+)`, "m"))?.[1] ?? 0) * 1024;
	return { totalBytes: kb("MemTotal"), availableBytes: kb("MemAvailable") };
}

export interface CpuTimes {
	busy: number;
	idle: number;
}

/** Aggregate `cpu` line of /proc/stat; idle includes iowait. */
export function parseCpuTimes(text: string): CpuTimes {
	const values = (text.match(/^cpu\s+(.*)$/m)?.[1] ?? "")
		.trim()
		.split(/\s+/)
		.map(Number);
	// user nice system idle iowait irq softirq steal (guest* already in user/nice)
	const [
		user = 0,
		nice = 0,
		system = 0,
		idle = 0,
		iowait = 0,
		irq = 0,
		softirq = 0,
		steal = 0,
	] = values;
	return {
		busy: user + nice + system + irq + softirq + steal,
		idle: idle + iowait,
	};
}

export function cpuBusyPercent(prev: CpuTimes, next: CpuTimes): number {
	const busy = next.busy - prev.busy;
	const total = busy + (next.idle - prev.idle);
	return total > 0 ? (busy / total) * 100 : 0;
}

export interface SysFs {
	list(dir: string): Promise<string[]>;
	read(path: string): Promise<string>;
}

/** An iGPU with a small VRAM carve-out living in shared system RAM (GTT). */
const UMA_VRAM_LIMIT = 2 * 1024 ** 3;

export async function readGpus(fs: SysFs): Promise<GpuInfo[]> {
	let entries: string[];
	try {
		entries = await fs.list("/sys/class/drm");
	} catch {
		return [];
	}
	const cards = entries.filter((e) => /^card\d+$/.test(e));
	const gpus: GpuInfo[] = [];
	for (const card of cards) {
		const base = `/sys/class/drm/${card}/device`;
		const text = (name: string) => fs.read(`${base}/${name}`).catch(() => null);
		const num = async (name: string) => {
			const value = await text(name);
			return value === null ? null : Number(value.trim());
		};
		const uevent = (await text("uevent")) ?? "";
		const vramTotalBytes = await num("mem_info_vram_total");
		const gttTotalBytes = await num("mem_info_gtt_total");
		gpus.push({
			card,
			driver: uevent.match(/^DRIVER=(.*)$/m)?.[1] ?? null,
			pciId: uevent.match(/^PCI_ID=(.*)$/m)?.[1] ?? null,
			vramTotalBytes,
			vramUsedBytes: await num("mem_info_vram_used"),
			gttTotalBytes,
			gttUsedBytes: await num("mem_info_gtt_used"),
			busyPercent: await num("gpu_busy_percent"),
			uma:
				vramTotalBytes !== null &&
				vramTotalBytes <= UMA_VRAM_LIMIT &&
				gttTotalBytes !== null &&
				gttTotalBytes > vramTotalBytes,
		});
	}
	return gpus;
}
