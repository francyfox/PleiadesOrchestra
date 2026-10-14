import type { Db } from "./database.ts";

const caches = new WeakMap<Db, Map<string, unknown>>();

/**
 * Builds a prepared statement once per database handle and reuses it. Drizzle
 * otherwise rebuilds the SQL string on every `.get()`/`.run()`; hot paths
 * (widget auth) call this with a stable `key` instead.
 */
export function prepared<T>(db: Db, key: string, build: () => T): T {
	let cache = caches.get(db);
	if (!cache) {
		cache = new Map();
		caches.set(db, cache);
	}
	if (!cache.has(key)) cache.set(key, build());
	return cache.get(key) as T;
}
