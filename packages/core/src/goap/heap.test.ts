import { describe, expect, test } from "bun:test";
import { MinHeap } from "#core/goap/heap";

describe("MinHeap", () => {
	test("pops by ascending priority", () => {
		const heap = new MinHeap<string>();
		heap.push("c", 3);
		heap.push("a", 1);
		heap.push("b", 2);
		expect([heap.pop(), heap.pop(), heap.pop(), heap.pop()]).toEqual([
			"a",
			"b",
			"c",
			undefined,
		]);
	});

	test("equal priorities pop in insertion order (FIFO)", () => {
		const heap = new MinHeap<number>();
		for (let i = 0; i < 50; i++) heap.push(i, i % 3);
		const out: number[] = [];
		for (let v = heap.pop(); v !== undefined; v = heap.pop()) out.push(v);
		const expected = [...Array(50).keys()].sort(
			(a, b) => (a % 3) - (b % 3) || a - b,
		);
		expect(out).toEqual(expected);
	});

	test("matches a stable sort on random input, interleaving push and pop", () => {
		let seed = 7;
		const rnd = () => {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			return seed;
		};
		const heap = new MinHeap<number>();
		const mirror: { id: number; p: number }[] = [];
		for (let id = 0; id < 500; id++) {
			const p = rnd() % 10;
			heap.push(id, p);
			mirror.push({ id, p });
			if (rnd() % 3 === 0) {
				let best = 0;
				for (let i = 1; i < mirror.length; i++) {
					if (
						(mirror[i] as { p: number }).p < (mirror[best] as { p: number }).p
					)
						best = i;
				}
				expect(heap.pop()).toBe(
					(mirror.splice(best, 1)[0] as { id: number }).id,
				);
			}
		}
		expect(heap.size).toBe(mirror.length);
	});
});
