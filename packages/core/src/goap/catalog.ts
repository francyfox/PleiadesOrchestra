import type { GoapAction } from "./types";

/**
 * Drops preconditions that no action in the catalog (and not the caller's
 * `alwaysTrue` facts) can ever make true. The e-commerce taxonomy assumes a
 * "choose a store" step exists; on a site with a single store there is no such
 * tool, and without this the planner would see `search` as unreachable
 * instead of simply not needing a store first.
 *
 * Returns copies — the inputs are shared catalog entries and stay untouched.
 */
export function pruneUnproducibleFacts(
	actions: GoapAction[],
	alwaysTrue: readonly string[] = [],
): GoapAction[] {
	const producible = new Set<string>(alwaysTrue);
	for (const action of actions) {
		for (const key of Object.keys(action.effects)) producible.add(key);
	}
	return actions.map((action) => {
		const kept = Object.entries(action.preconditions).filter(([key]) =>
			producible.has(key),
		);
		return kept.length === Object.keys(action.preconditions).length
			? action
			: { ...action, preconditions: Object.fromEntries(kept) };
	});
}
