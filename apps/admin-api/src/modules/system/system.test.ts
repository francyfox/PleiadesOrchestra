import { describe, expect, test } from "bun:test";
import {
	cpuBusyPercent,
	parseCpuInfo,
	parseCpuTimes,
	parseMemInfo,
	readGpus,
} from "./system.service.ts";

// Two SMT siblings per core, 2 cores — trimmed real /proc/cpuinfo layout.
const CPUINFO = [0, 1, 2, 3]
	.map(
		(i) => `processor\t: ${i}
model name\t: AMD Ryzen 5 5600H with Radeon Graphics
physical id\t: 0
core id\t\t: ${Math.floor(i / 2)}
flags\t\t: fpu sse2 avx fma f16c avx2 sha_ni
`,
	)
	.join("\n");

describe("parseCpuInfo", () => {
	test("model, logical vs physical cores, and SIMD features", () => {
		expect(parseCpuInfo(CPUINFO)).toEqual({
			model: "AMD Ryzen 5 5600H with Radeon Graphics",
			logicalCores: 4,
			physicalCores: 2,
			features: {
				avx2: true,
				fma: true,
				f16c: true,
				avx512: false,
				avxVnni: false,
			},
		});
	});
});

test("parseMemInfo converts kB to bytes", () => {
	expect(
		parseMemInfo(
			"MemTotal:       32244388 kB\nMemFree: 1 kB\nMemAvailable:   14522368 kB\n",
		),
	).toEqual({ totalBytes: 32244388 * 1024, availableBytes: 14522368 * 1024 });
});

test("CPU busy % is the non-idle share of time between two /proc/stat samples", () => {
	// user nice system idle iowait irq softirq steal
	const a = parseCpuTimes("cpu  100 0 100 700 100 0 0 0 0 0\ncpu0 1 2 3");
	const b = parseCpuTimes("cpu  200 0 200 1300 200 0 0 0 0 0\n");
	// Δbusy = 200, Δidle (idle+iowait) = 700 → 200 / 900.
	expect(cpuBusyPercent(a, b)).toBeCloseTo((200 / 900) * 100);
	expect(cpuBusyPercent(a, a)).toBe(0);
});

describe("readGpus", () => {
	const files: Record<string, string> = {
		"/sys/class/drm/card1/device/uevent": "DRIVER=amdgpu\nPCI_ID=1002:1638\n",
		"/sys/class/drm/card1/device/mem_info_vram_total": "536870912\n",
		"/sys/class/drm/card1/device/mem_info_vram_used": "493760512\n",
		"/sys/class/drm/card1/device/mem_info_gtt_total": "16509124608\n",
		"/sys/class/drm/card1/device/mem_info_gtt_used": "1488000000\n",
		"/sys/class/drm/card1/device/gpu_busy_percent": "15\n",
	};
	const fs = {
		list: async () => ["card1", "card1-DP-1", "renderD128", "version"],
		read: async (path: string) => {
			const value = files[path];
			if (value === undefined) throw new Error(`ENOENT ${path}`);
			return value;
		},
	};

	test("reads amdgpu memory and load, and flags a small-VRAM APU as UMA", async () => {
		expect(await readGpus(fs)).toEqual([
			{
				card: "card1",
				driver: "amdgpu",
				pciId: "1002:1638",
				vramTotalBytes: 536870912,
				vramUsedBytes: 493760512,
				gttTotalBytes: 16509124608,
				gttUsedBytes: 1488000000,
				busyPercent: 15,
				uma: true,
			},
		]);
	});

	test("no DRM cards (or no /sys access) means no GPUs, not an error", async () => {
		expect(
			await readGpus({
				list: async () => {
					throw new Error("ENOENT");
				},
				read: fs.read,
			}),
		).toEqual([]);
	});
});
