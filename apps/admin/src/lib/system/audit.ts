import type { GpuInfo, SystemSnapshot } from "$lib/system-types";

/**
 * Lighthouse-style hardware audit for running a small local LLM (llama.cpp)
 * plus Laya (onnxruntime) side by side. Every scored metric is compared
 * against IDEAL_MACHINE (= 100); informational audits (score `null`) carry
 * advice or live state and never move the score.
 *
 * Language-neutral on purpose: audits carry an id, an optional `variant`
 * (which advice applies) and raw `facts` (numbers, bytes, flags). All text —
 * titles, descriptions, formatted values — lives in the page's dictionary
 * (recommendations.content.ts), so ru/en/kk render from the same data.
 */

const GiB = 1024 ** 3;

/** The reference machine that scores 100 (described in the dictionary). */
export const IDEAL_MACHINE = {
	physicalCores: 16,
	ramBytes: 64 * GiB,
	vramBytes: 16 * GiB,
} as const;

export type ScoreClass = "pass" | "average" | "fail" | "info";

/** Lighthouse thresholds: ≥ 0.9 pass, ≥ 0.5 average, below that fail. */
export function scoreClass(score: number | null): ScoreClass {
	if (score === null) return "info";
	if (score >= 0.9) return "pass";
	if (score >= 0.5) return "average";
	return "fail";
}

export type AuditId =
	| "physical-cores"
	| "simd"
	| "avx512"
	| "vnni"
	| "smt-threads"
	| "cpu-load"
	| "ram-total"
	| "ram-available"
	| "uma-bandwidth"
	| "accelerator"
	| "vram"
	| "laya-gpu"
	| "gpu-backend";

export type Vendor = "nvidia" | "amd" | "intel" | "other";

type Fact = string | number | boolean | null;

export interface Audit {
	id: AuditId;
	/** 0..1 against the ideal machine; null = informational, not scored. */
	score: number | null;
	/** Relative weight inside its category (ignored when score is null). */
	weight: number;
	/** Which wording applies (e.g. "busy" / "normal"); absent = the only one. */
	variant?: string;
	/** Raw values for the display text; formatted by the UI per locale. */
	facts: Record<string, Fact>;
}

export interface AuditCategory {
	id: "cpu" | "memory" | "accelerator";
	/** 0..100, rounded. */
	score: number;
	audits: Audit[];
}

export interface ComparisonRow {
	metric: "cores" | "ram" | "vram" | "gpu" | "simd";
	actual: Record<string, Fact>;
	/** 0..100, or null where a percentage makes no sense. */
	percent: number | null;
}

export interface MachineReport {
	score: number;
	categories: AuditCategory[];
	comparison: ComparisonRow[];
}

export function vendorOf(gpu: GpuInfo): Vendor {
	const pci = gpu.pciId?.toUpperCase() ?? "";
	if (pci.startsWith("10DE") || gpu.driver === "nvidia") return "nvidia";
	if (pci.startsWith("1002") || gpu.driver === "amdgpu") return "amd";
	if (pci.startsWith("8086") || gpu.driver === "i915" || gpu.driver === "xe")
		return "intel";
	return "other";
}

const ratio = (actual: number, ideal: number) => Math.min(actual / ideal, 1);
const binary = (ok: boolean) => (ok ? 1 : 0);

/** The GPU that matters most: a dedicated one beats an iGPU, NVIDIA beats the rest. */
function bestGpu(gpus: GpuInfo[]): GpuInfo | null {
	const rank = (g: GpuInfo) =>
		(g.uma ? 0 : 10) +
		(vendorOf(g) === "nvidia" ? 2 : vendorOf(g) === "amd" ? 1 : 0);
	return [...gpus].sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

function categoryScore(audits: Audit[]): number {
	const scored = audits.filter((a) => a.score !== null);
	const total = scored.reduce((sum, a) => sum + a.weight, 0);
	if (total === 0) return 0;
	const value = scored.reduce(
		(sum, a) => sum + a.weight * (a.score as number),
		0,
	);
	return Math.round((value / total) * 100);
}

function cpuAudits(s: SystemSnapshot): Audit[] {
	const { cpu } = s;
	const f = cpu.features;
	const audits: Audit[] = [
		{
			id: "physical-cores",
			score: ratio(cpu.physicalCores, IDEAL_MACHINE.physicalCores),
			weight: 5,
			facts: { actual: cpu.physicalCores, ideal: IDEAL_MACHINE.physicalCores },
		},
		{
			id: "simd",
			score: binary(f.avx2 && f.fma),
			weight: 2,
			facts: { present: f.avx2 && f.fma },
		},
		{
			id: "avx512",
			score: binary(f.avx512),
			weight: 1,
			facts: { present: f.avx512 },
		},
		{
			id: "vnni",
			score: binary(f.avxVnni),
			weight: 2,
			facts: { present: f.avxVnni },
		},
	];
	if (cpu.logicalCores > cpu.physicalCores) {
		audits.push({
			id: "smt-threads",
			score: null,
			weight: 0,
			facts: { physical: cpu.physicalCores, logical: cpu.logicalCores },
		});
	}
	if (s.cpuBusyPercent !== null) {
		audits.push({
			id: "cpu-load",
			score: null,
			weight: 0,
			variant: s.cpuBusyPercent > 85 ? "busy" : "normal",
			facts: { percent: Math.round(s.cpuBusyPercent) },
		});
	}
	return audits;
}

function memoryAudits(s: SystemSnapshot, gpu: GpuInfo | null): Audit[] {
	const audits: Audit[] = [
		{
			id: "ram-total",
			score: ratio(s.memory.totalBytes, IDEAL_MACHINE.ramBytes),
			weight: 1,
			facts: { actual: s.memory.totalBytes, ideal: IDEAL_MACHINE.ramBytes },
		},
		{
			id: "ram-available",
			score: null,
			weight: 0,
			variant: s.memory.availableBytes < 4 * GiB ? "low" : "ok",
			facts: { bytes: s.memory.availableBytes },
		},
	];
	if (gpu?.uma) {
		audits.push({
			id: "uma-bandwidth",
			score: null,
			weight: 0,
			facts: { vram: gpu.vramTotalBytes, gtt: gpu.gttTotalBytes },
		});
	}
	return audits;
}

function acceleratorAudits(gpu: GpuInfo | null): Audit[] {
	const vendor = gpu ? vendorOf(gpu) : null;
	const placement = !gpu ? "none" : gpu.uma ? "integrated" : "dedicated";

	return [
		{
			id: "accelerator",
			score: !gpu ? 0 : gpu.uma ? 0.35 : vendor === "nvidia" ? 1 : 0.8,
			weight: 5,
			variant: placement,
			facts: { vendor },
		},
		{
			id: "vram",
			score: !gpu
				? 0
				: gpu.uma
					? gpu.gttTotalBytes === null
						? 0
						: ratio(gpu.gttTotalBytes, IDEAL_MACHINE.vramBytes) * 0.25
					: gpu.vramTotalBytes === null
						? null
						: ratio(gpu.vramTotalBytes, IDEAL_MACHINE.vramBytes),
			weight: 3,
			variant: placement,
			facts: {
				vram: gpu?.vramTotalBytes ?? null,
				gtt: gpu?.gttTotalBytes ?? null,
				ideal: IDEAL_MACHINE.vramBytes,
			},
		},
		{
			id: "laya-gpu",
			score: binary(vendor === "nvidia" && !gpu?.uma),
			weight: 2,
			variant: vendor === "nvidia" ? "cuda" : "cpu",
			facts: {},
		},
		{
			id: "gpu-backend",
			score: null,
			weight: 0,
			variant: !gpu
				? "none"
				: vendor === "nvidia"
					? "nvidia"
					: vendor === "amd" && !gpu.uma
						? "amdDedicated"
						: "integrated",
			facts: { vendor },
		},
	];
}

const CATEGORY_WEIGHTS = { cpu: 0.35, memory: 0.25, accelerator: 0.4 } as const;

export function auditMachine(s: SystemSnapshot): MachineReport {
	const gpu = bestGpu(s.gpus);
	const categories: AuditCategory[] = (
		[
			{ id: "cpu", audits: cpuAudits(s) },
			{ id: "memory", audits: memoryAudits(s, gpu) },
			{ id: "accelerator", audits: acceleratorAudits(gpu) },
		] as const
	).map((c) => ({
		id: c.id,
		audits: c.audits,
		score: categoryScore(c.audits),
	}));

	const score = Math.round(
		categories.reduce((sum, c) => sum + CATEGORY_WEIGHTS[c.id] * c.score, 0),
	);

	const pct = (a: number, b: number) => Math.round(ratio(a, b) * 100);
	return {
		score,
		categories,
		comparison: [
			{
				metric: "cores",
				actual: { value: s.cpu.physicalCores },
				percent: pct(s.cpu.physicalCores, IDEAL_MACHINE.physicalCores),
			},
			{
				metric: "ram",
				actual: { bytes: s.memory.totalBytes },
				percent: pct(s.memory.totalBytes, IDEAL_MACHINE.ramBytes),
			},
			{
				metric: "vram",
				actual: {
					bytes: gpu?.vramTotalBytes ?? null,
					uma: gpu?.uma ?? false,
					present: gpu !== null,
				},
				percent:
					!gpu || gpu.vramTotalBytes === null
						? 0
						: pct(gpu.vramTotalBytes, IDEAL_MACHINE.vramBytes),
			},
			{
				metric: "gpu",
				actual: {
					placement: !gpu ? "none" : gpu.uma ? "integrated" : "dedicated",
					vendor: gpu ? vendorOf(gpu) : null,
				},
				percent: null,
			},
			{
				metric: "simd",
				actual: {
					avx2: s.cpu.features.avx2,
					avx512: s.cpu.features.avx512,
					vnni: s.cpu.features.avxVnni,
				},
				percent: null,
			},
		],
	};
}
