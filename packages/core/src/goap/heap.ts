/**
 * Binary min-heap with FIFO tie-breaking: among equal priorities the entry
 * pushed first pops first. That reproduces a "scan for strictly smaller,
 * splice out" linear frontier exactly, so swapping it in cannot reorder plans.
 */
export class MinHeap<T> {
	private readonly items: { value: T; priority: number; seq: number }[] = [];
	private nextSeq = 0;

	get size(): number {
		return this.items.length;
	}

	push(value: T, priority: number): void {
		const items = this.items;
		const entry = { value, priority, seq: this.nextSeq++ };
		let i = items.length;
		items.push(entry);
		while (i > 0) {
			const parent = (i - 1) >> 1;
			const p = items[parent] as typeof entry;
			if (!MinHeap.before(entry, p)) break;
			items[i] = p;
			i = parent;
		}
		items[i] = entry;
	}

	pop(): T | undefined {
		const items = this.items;
		const top = items[0];
		if (!top) return undefined;
		const last = items.pop() as NonNullable<typeof top>;
		const n = items.length;
		if (n > 0) {
			let i = 0;
			for (;;) {
				let child = 2 * i + 1;
				if (child >= n) break;
				const right = child + 1;
				if (
					right < n &&
					MinHeap.before(
						items[right] as typeof last,
						items[child] as typeof last,
					)
				) {
					child = right;
				}
				const c = items[child] as typeof last;
				if (!MinHeap.before(c, last)) break;
				items[i] = c;
				i = child;
			}
			items[i] = last;
		}
		return top.value;
	}

	private static before(
		a: { priority: number; seq: number },
		b: { priority: number; seq: number },
	): boolean {
		return (
			a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq)
		);
	}
}
