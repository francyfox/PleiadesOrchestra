export interface LruMapOptions {
	/** Most entries kept; the least recently used one goes first. */
	maxEntries: number;
	/** Lifetime of an entry from the moment it was set (reads do not extend it). */
	ttlMs?: number;
	now?: () => number;
}

/**
 * A `Map` that cannot grow without bound: capped in size (LRU) and optionally
 * in age. Drop-in where the code only uses get/set/has/delete.
 */
export class LruMap<K, V> extends Map<K, V> {
	private readonly storedAt = new Map<K, number>();
	private readonly maxEntries: number;
	private readonly ttlMs: number | undefined;
	private readonly now: () => number;

	constructor({ maxEntries, ttlMs, now = Date.now }: LruMapOptions) {
		super();
		this.maxEntries = maxEntries;
		this.ttlMs = ttlMs;
		this.now = now;
	}

	private expired(key: K): boolean {
		const at = this.storedAt.get(key);
		return (
			this.ttlMs !== undefined &&
			at !== undefined &&
			this.now() - at >= this.ttlMs
		);
	}

	override get(key: K): V | undefined {
		if (!super.has(key)) return undefined;
		if (this.expired(key)) {
			this.delete(key);
			return undefined;
		}
		const value = super.get(key) as V;
		super.delete(key);
		super.set(key, value); // most recently used last
		return value;
	}

	override has(key: K): boolean {
		if (!super.has(key)) return false;
		if (this.expired(key)) {
			this.delete(key);
			return false;
		}
		return true;
	}

	override set(key: K, value: V): this {
		super.delete(key);
		super.set(key, value);
		this.storedAt.set(key, this.now());
		if (this.size > this.maxEntries) this.evict();
		return this;
	}

	override delete(key: K): boolean {
		this.storedAt.delete(key);
		return super.delete(key);
	}

	override clear(): void {
		this.storedAt.clear();
		super.clear();
	}

	/** Expired entries first, then least recently used until within the cap. */
	private evict(): void {
		if (this.ttlMs !== undefined) {
			for (const key of [...this.keys()]) {
				if (this.expired(key)) this.delete(key);
			}
		}
		while (this.size > this.maxEntries) {
			const oldest = this.keys().next().value;
			if (oldest === undefined && this.size === 0) break;
			this.delete(oldest as K);
		}
	}
}
