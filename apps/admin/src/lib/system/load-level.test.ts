import { describe, expect, test } from "bun:test";
import type { SystemSnapshot } from "$lib/system-types";
import { loadLevel, snapshotLevels, worstLevel } from "./load-level";

describe("loadLevel", () => {
	test("green below the warning threshold", () => {
		expect(loadLevel(0)).toBe("ok");
		expect(loadLevel(69.9)).toBe("ok");
	});

	test("yellow from 70 up to (not including) 90", () => {
		expect(loadLevel(70)).toBe("warn");
		expect(loadLevel(89.9)).toBe("warn");
	});

	test("red from 90", () => {
		expect(loadLevel(90)).toBe("critical");
		expect(loadLevel(100)).toBe("critical");
	});

	test("no reading is its own level, never green", () => {
		expect(loadLevel(null)).toBe("unknown");
	});

	test("thresholds can be overridden", () => {
		expect(loadLevel(50, { warn: 40, critical: 60 })).toBe("warn");
	});
});

describe("worstLevel", () => {
	test("picks the most severe level", () => {
		expect(worstLevel(["ok", "warn", "ok"])).toBe("warn");
		expect(worstLevel(["ok", "critical", "warn"])).toBe("critical");
	});

	test("unknown never hides a real reading", () => {
		expect(worstLevel(["unknown", "ok"])).toBe("ok");
		expect(worstLevel(["unknown", "warn"])).toBe("warn");
	});

	test("nothing but unknown stays unknown", () => {
		expect(worstLevel(["unknown"])).toBe("unknown");
		expect(worstLevel([])).toBe("unknown");
	});
});

describe("snapshotLevels", () => {
	const GB = 1024 ** 3;
	const base: SystemSnapshot = {
		cpu: {
			model: "x",
			logicalCores: 8,
			physicalCores: 4,
			features: {
				avx2: true,
				fma: true,
				f16c: true,
				avx512: false,
				avxVnni: false,
			},
		},
		cpuBusyPercent: 10,
		memory: { totalBytes: 16 * GB, availableBytes: 12 * GB },
		gpus: [],
		at: 0,
	};
	const gpu = (overrides: Partial<SystemSnapshot["gpus"][number]> = {}) => ({
		card: "card0",
		driver: null,
		pciId: null,
		vramTotalBytes: 8 * GB,
		vramUsedBytes: 1 * GB,
		gttTotalBytes: null,
		gttUsedBytes: null,
		busyPercent: 5,
		uma: false,
		...overrides,
	});

	test("RAM level follows used share, not available bytes", () => {
		const levels = snapshotLevels({
			...base,
			memory: { totalBytes: 16 * GB, availableBytes: 1 * GB },
		});
		expect(levels.ram).toBe("critical");
	});

	test("CPU with no reading yet is unknown", () => {
		expect(snapshotLevels({ ...base, cpuBusyPercent: null }).cpu).toBe(
			"unknown",
		);
	});

	test("no GPU: gpu and vram are unknown and do not colour the overall level", () => {
		const levels = snapshotLevels(base);
		expect(levels.gpu).toBe("unknown");
		expect(levels.vram).toBe("unknown");
		expect(levels.overall).toBe("ok");
	});

	test("a discrete GPU reports VRAM share", () => {
		const levels = snapshotLevels({
			...base,
			gpus: [gpu({ vramUsedBytes: 7.5 * GB })],
		});
		expect(levels.vram).toBe("critical");
	});

	test("an integrated GPU is judged by GTT, since its VRAM is a small carve-out", () => {
		const levels = snapshotLevels({
			...base,
			gpus: [
				gpu({
					uma: true,
					vramTotalBytes: 0.5 * GB,
					vramUsedBytes: 0.5 * GB,
					gttTotalBytes: 8 * GB,
					gttUsedBytes: 1 * GB,
				}),
			],
		});
		expect(levels.vram).toBe("ok");
	});

	test("overall is the worst of the four", () => {
		const levels = snapshotLevels({
			...base,
			cpuBusyPercent: 75,
			gpus: [gpu({ busyPercent: 95 })],
		});
		expect(levels.overall).toBe("critical");
	});
});
