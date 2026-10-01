import { describe, expect, test } from "bun:test";
import { createSystemSampler } from "./system-snapshot.service.ts";

const CPUINFO = "processor : 0\nmodel name : Test\nflags : avx2 fma\n";

function fakeFs() {
	const reads: string[] = [];
	let busy = 100;
	return {
		reads,
		advance: (by: number) => {
			busy += by;
		},
		fs: {
			list: async () => [],
			read: async (path: string) => {
				reads.push(path);
				if (path === "/proc/cpuinfo") return CPUINFO;
				if (path === "/proc/meminfo")
					return "MemTotal: 8 kB\nMemAvailable: 4 kB\n";
				if (path === "/proc/stat") return `cpu ${busy} 0 0 100 0 0 0 0\n`;
				throw new Error(`unexpected read ${path}`);
			},
		},
	};
}

describe("createSystemSampler", () => {
	test("parses the static CPU info once", async () => {
		const host = fakeFs();
		let now = 0;
		const snapshot = createSystemSampler({
			fs: host.fs,
			now: () => now,
			minIntervalMs: 10,
		});
		await snapshot();
		now = 100;
		await snapshot();
		expect(host.reads.filter((p) => p === "/proc/cpuinfo")).toHaveLength(1);
		expect(host.reads.filter((p) => p === "/proc/stat")).toHaveLength(2);
	});

	test("reuses a fresh snapshot instead of reading /proc again", async () => {
		const host = fakeFs();
		let now = 0;
		const snapshot = createSystemSampler({
			fs: host.fs,
			now: () => now,
			minIntervalMs: 1000,
		});
		const first = await snapshot();
		now = 500;
		expect(await snapshot()).toBe(first);
		now = 1000;
		expect(await snapshot()).not.toBe(first);
	});

	test("callers that arrive together share one read", async () => {
		const host = fakeFs();
		const snapshot = createSystemSampler({
			fs: host.fs,
			now: () => 0,
			minIntervalMs: 0,
		});
		await Promise.all([snapshot(), snapshot(), snapshot()]);
		expect(host.reads.filter((p) => p === "/proc/stat")).toHaveLength(1);
	});

	test("busy % is null on the first snapshot and a delta afterwards", async () => {
		const host = fakeFs();
		let now = 0;
		const snapshot = createSystemSampler({
			fs: host.fs,
			now: () => now,
			minIntervalMs: 0,
		});
		expect((await snapshot()).cpuBusyPercent).toBeNull();
		host.advance(100); // +100 busy, +0 idle
		now = 1;
		expect((await snapshot()).cpuBusyPercent).toBe(100);
	});
});
