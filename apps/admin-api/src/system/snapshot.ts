import { readdir } from "node:fs/promises";
import type { SystemSnapshot } from "../schemas/system.ts";
import {
	type CpuTimes,
	cpuBusyPercent,
	parseCpuInfo,
	parseCpuTimes,
	parseMemInfo,
	readGpus,
} from "./probe";

const read = (path: string) => Bun.file(path).text();

let previous: CpuTimes | null = null;

/**
 * Current host snapshot. CPU load is the delta against the previous call,
 * so the header's polling interval is also the averaging window.
 */
export async function systemSnapshot(): Promise<SystemSnapshot> {
	const [cpuinfo, meminfo, stat, gpus] = await Promise.all([
		read("/proc/cpuinfo"),
		read("/proc/meminfo"),
		read("/proc/stat"),
		readGpus({ list: (dir) => readdir(dir), read }),
	]);
	const times = parseCpuTimes(stat);
	const busy = previous ? cpuBusyPercent(previous, times) : null;
	previous = times;
	return {
		cpu: parseCpuInfo(cpuinfo),
		cpuBusyPercent: busy,
		memory: parseMemInfo(meminfo),
		gpus,
		at: Date.now(),
	};
}
