import { readdir } from "node:fs/promises";
import type { SystemSnapshot } from "./system.schema.ts";
import {
	type CpuTimes,
	cpuBusyPercent,
	parseCpuInfo,
	parseCpuTimes,
	parseMemInfo,
	readGpus,
	type SysFs,
} from "./system.service.ts";

export interface SamplerOptions {
	fs?: SysFs;
	now?: () => number;
	/** A snapshot younger than this is reused instead of reading `/proc` again. */
	minIntervalMs?: number;
}

const defaultFs: SysFs = {
	list: (dir) => readdir(dir),
	read: (path) => Bun.file(path).text(),
};

/**
 * Reads the host's CPU / RAM / GPU state. Three things keep it cheap:
 * - the CPU model, core counts and SIMD flags never change, so `/proc/cpuinfo`
 *   (one block per logical core) is parsed once;
 * - snapshots are reused for `minIntervalMs`: the socket's first message and
 *   the shared timer both ask, and two reads a few ms apart would also give a
 *   meaningless "busy %" (a delta over almost no time);
 * - concurrent callers share one in-flight read.
 * CPU load is the delta against the previous read, so the polling interval is
 * also the averaging window.
 */
export function createSystemSampler({
	fs = defaultFs,
	now = Date.now,
	minIntervalMs = 1000,
}: SamplerOptions = {}) {
	let cpu: SystemSnapshot["cpu"] | undefined;
	let previous: CpuTimes | null = null;
	let last: SystemSnapshot | undefined;
	let inflight: Promise<SystemSnapshot> | undefined;

	async function read(): Promise<SystemSnapshot> {
		const [staticCpu, meminfo, stat, gpus] = await Promise.all([
			cpu ?? fs.read("/proc/cpuinfo").then(parseCpuInfo),
			fs.read("/proc/meminfo"),
			fs.read("/proc/stat"),
			readGpus(fs),
		]);
		cpu = staticCpu;
		const times = parseCpuTimes(stat);
		const busy = previous ? cpuBusyPercent(previous, times) : null;
		previous = times;
		last = {
			cpu: staticCpu,
			cpuBusyPercent: busy,
			memory: parseMemInfo(meminfo),
			gpus,
			at: now(),
		};
		return last;
	}

	return function snapshot(): Promise<SystemSnapshot> {
		if (last && now() - last.at < minIntervalMs) return Promise.resolve(last);
		inflight ??= read().finally(() => {
			inflight = undefined;
		});
		return inflight;
	};
}

/** The process-wide sampler. */
export const systemSnapshot = createSystemSampler();
