interface Window {
	start: number;
	count: number;
}

/**
 * In-memory fixed-window counter. There is one orchestrator process, so no
 * shared store is needed; a restart just resets the budgets.
 */
export class FixedWindowLimiter {
	private readonly windows = new Map<string, Window>();
	private nextPruneAt = 0;

	constructor(
		private readonly limit: number,
		private readonly windowMs: number,
		private readonly now: () => number = Date.now,
		/** Look for expired windows once the map holds this many keys. */
		private readonly pruneAbove = 10_000,
	) {}

	/** Counts a hit; `false` when the key is over its budget for the current window. */
	hit(key: string): boolean {
		const now = this.now();
		this.pruneIfFull(now);

		const current = this.windows.get(key);
		if (!current || now - current.start >= this.windowMs) {
			this.windows.set(key, { start: now, count: 1 });
			return true;
		}
		if (current.count >= this.limit) return false;
		current.count++;
		return true;
	}

	get size(): number {
		return this.windows.size;
	}

	/**
	 * At most one full scan per window. Without the time gate a flood of
	 * fresh keys (all still live) would rescan the whole map on every hit.
	 */
	private pruneIfFull(now: number): void {
		if (this.windows.size < this.pruneAbove || now < this.nextPruneAt) return;
		this.nextPruneAt = now + this.windowMs;
		for (const [key, window] of this.windows) {
			if (now - window.start >= this.windowMs) this.windows.delete(key);
		}
	}
}
