/**
 * onnxruntime threading for Laya. Measured with apps/snake-benchmark on the
 * target Ryzen 5 5600H (results/threads-sweep-2026-09-24.json): 6 threads =
 * physical cores gave p50 382 ms vs 619 ms for onnxruntime's default, which
 * also oversubscribes SMT siblings (12 threads: p50 564 ms, p99 975 ms).
 * `0` keeps onnxruntime's default.
 */
export function sessionOptionsFor(threads: number) {
	if (threads <= 0) return undefined;
	return { intraOpNumThreads: threads, interOpNumThreads: 1 };
}
