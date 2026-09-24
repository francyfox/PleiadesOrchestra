interface Window {
	start: number;
	count: number;
}

/**
 * In-memory fixed-window counter. One orchestrator process, so no shared
 * store is needed; a restart just resets the budgets.
 */
export class FixedWindowLimiter {
	private readonly windows = new Map<string, Window>();

	constructor(
		private readonly limit: number,
		private readonly windowMs: number,
		private readonly now: () => number = Date.now,
		/** Prune expired windows once the map holds this many keys. */
		private readonly pruneAbove = 10_000,
	) {}

	/** Counts a hit; `false` when the key is over its budget for the current window. */
	hit(key: string): boolean {
		const now = this.now();
		if (this.windows.size >= this.pruneAbove) this.prune(now);

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

	private prune(now: number): void {
		for (const [key, window] of this.windows) {
			if (now - window.start >= this.windowMs) this.windows.delete(key);
		}
	}
}
