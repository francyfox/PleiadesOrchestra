import { describe, expect, test } from "bun:test";
import type { GpuInfo, SystemSnapshot } from "$lib/system-types";
import { auditMachine, IDEAL_MACHINE, scoreClass } from "./audit";

const GiB = 1024 ** 3;

function gpu(overrides: Partial<GpuInfo>): GpuInfo {
	return {
		card: "card0",
		driver: null,
		pciId: null,
		vramTotalBytes: null,
		vramUsedBytes: null,
		gttTotalBytes: null,
		gttUsedBytes: null,
		busyPercent: null,
		uma: false,
		...overrides,
	};
}

const amdApu = gpu({
	driver: "amdgpu",
	pciId: "1002:1638",
	vramTotalBytes: 0.5 * GiB,
	gttTotalBytes: 15 * GiB,
	uma: true,
});
const nvidia16 = gpu({
	driver: "nvidia",
	pciId: "10DE:2782",
	vramTotalBytes: 16 * GiB,
});

function machine(overrides: Partial<SystemSnapshot> = {}): SystemSnapshot {
	return {
		cpu: {
			model: "Some CPU",
			logicalCores: 12,
			physicalCores: 6,
			features: {
				avx2: true,
				fma: true,
				f16c: true,
				avx512: false,
				avxVnni: false,
			},
		},
		cpuBusyPercent: 10,
		memory: { totalBytes: 32 * GiB, availableBytes: 14 * GiB },
		gpus: [amdApu],
		at: 0,
		...overrides,
	};
}

const ideal = (): SystemSnapshot =>
	machine({
		cpu: {
			model: "Ideal",
			logicalCores: IDEAL_MACHINE.physicalCores * 2,
			physicalCores: IDEAL_MACHINE.physicalCores,
			features: {
				avx2: true,
				fma: true,
				f16c: true,
				avx512: true,
				avxVnni: true,
			},
		},
		memory: { totalBytes: IDEAL_MACHINE.ramBytes, availableBytes: 40 * GiB },
		gpus: [gpu({ ...nvidia16, vramTotalBytes: IDEAL_MACHINE.vramBytes })],
	});

const find = (report: ReturnType<typeof auditMachine>, id: string) =>
	report.categories.flatMap((c) => c.audits).find((a) => a.id === id);

describe("auditMachine", () => {
	test("the ideal machine scores 100 overall and in every category", () => {
		const report = auditMachine(ideal());
		expect(report.score).toBe(100);
		for (const category of report.categories) expect(category.score).toBe(100);
	});

	test("scales metrics against the ideal: 6 of the ideal's physical cores, half its RAM", () => {
		const report = auditMachine(machine());
		expect(find(report, "physical-cores")?.score).toBeCloseTo(
			6 / IDEAL_MACHINE.physicalCores,
		);
		expect(find(report, "ram-total")?.score).toBeCloseTo(
			(32 * GiB) / IDEAL_MACHINE.ramBytes,
		);
		expect(report.score).toBeGreaterThan(0);
		expect(report.score).toBeLessThan(100);
	});

	test("an integrated UMA GPU is only a partial accelerator; no GPU scores zero", () => {
		const apu = find(auditMachine(machine()), "accelerator")?.score ?? 1;
		const none = find(
			auditMachine(machine({ gpus: [] })),
			"accelerator",
		)?.score;
		const dedicated = find(
			auditMachine(machine({ gpus: [nvidia16] })),
			"accelerator",
		)?.score;
		expect(none).toBe(0);
		expect(apu).toBeGreaterThan(0);
		expect(apu).toBeLessThan(0.5);
		expect(dedicated).toBe(1);
	});

	test("backend advice follows the detected vendor, generically", () => {
		const nv = find(auditMachine(machine({ gpus: [nvidia16] })), "gpu-backend");
		const amd = find(auditMachine(machine()), "gpu-backend");
		const none = find(auditMachine(machine({ gpus: [] })), "gpu-backend");
		// Data only — the UI turns variants into localized text.
		expect(nv?.variant).toBe("nvidia");
		expect(amd?.variant).toBe("integrated");
		expect(none?.variant).toBe("none");
		expect(
			find(
				auditMachine(
					machine({
						gpus: [
							gpu({
								driver: "amdgpu",
								pciId: "1002:744C",
								vramTotalBytes: 24 * GiB,
							}),
						],
					}),
				),
				"gpu-backend",
			)?.variant,
		).toBe("amdDedicated");
		// Informational: advice, not part of the score.
		expect(nv?.score).toBeNull();
	});

	test("facts carry raw numbers for the UI to format per locale", () => {
		const cores = find(auditMachine(machine()), "physical-cores");
		expect(cores?.facts).toEqual({
			actual: 6,
			ideal: IDEAL_MACHINE.physicalCores,
		});
		const ram = find(auditMachine(machine()), "ram-available");
		expect(ram?.variant).toBe("ok");
		expect(ram?.facts.bytes).toBe(14 * GiB);
	});

	test("only NVIDIA lets onnxruntime run Laya on the GPU", () => {
		expect(
			find(auditMachine(machine({ gpus: [nvidia16] })), "laya-gpu")?.score,
		).toBe(1);
		expect(find(auditMachine(machine()), "laya-gpu")?.score).toBe(0);
	});

	test("live state (free RAM, CPU load) is diagnostic and never moves the score", () => {
		const calm = auditMachine(machine());
		const busy = auditMachine(
			machine({
				cpuBusyPercent: 97,
				memory: { totalBytes: 32 * GiB, availableBytes: 1 * GiB },
			}),
		);
		expect(busy.score).toBe(calm.score);
		expect(find(busy, "cpu-load")?.score).toBeNull();
		expect(find(busy, "ram-available")?.score).toBeNull();
	});
});

test("scoreClass follows Lighthouse thresholds", () => {
	expect(scoreClass(null)).toBe("info");
	expect(scoreClass(0.49)).toBe("fail");
	expect(scoreClass(0.5)).toBe("average");
	expect(scoreClass(0.89)).toBe("average");
	expect(scoreClass(0.9)).toBe("pass");
});
