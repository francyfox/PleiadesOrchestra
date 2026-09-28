import type { SystemSnapshot } from "../schemas/system.ts";

export interface SystemFeedOptions {
	snapshot: () => Promise<SystemSnapshot>;
	intervalMs: number;
	setInterval?: (fn: () => void, ms: number) => unknown;
	clearInterval?: (id: unknown) => void;
}

/**
 * Fans one sampling timer out to every subscriber. The timer exists only
 * while somebody is subscribed, so a panel with no open tab costs nothing.
 */
export function createSystemFeed({
	snapshot,
	intervalMs,
	setInterval: start = (fn, ms) => globalThis.setInterval(fn, ms),
	clearInterval: stop = (id) =>
		globalThis.clearInterval(id as ReturnType<typeof setInterval>),
}: SystemFeedOptions) {
	const listeners = new Set<(snapshot: SystemSnapshot) => void>();
	let timer: unknown;

	async function tick() {
		let current: SystemSnapshot;
		try {
			current = await snapshot();
		} catch {
			return;
		}
		for (const listener of [...listeners]) listener(current);
	}

	return {
		subscribe(listener: (snapshot: SystemSnapshot) => void): () => void {
			const entry = (value: SystemSnapshot) => listener(value);
			listeners.add(entry);
			timer ??= start(tick, intervalMs);
			return () => {
				listeners.delete(entry);
				if (listeners.size === 0 && timer !== undefined) {
					stop(timer);
					timer = undefined;
				}
			};
		},
	};
}

export type SystemFeed = ReturnType<typeof createSystemFeed>;
